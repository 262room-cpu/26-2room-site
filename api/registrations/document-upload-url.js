import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseAdmin, SupabaseConfigurationError } from '../_supabase.js'

const BUCKET = 'registration-documents'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FLOW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const ALLOWED_FILE_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

function hashFlowToken(flowToken) {
  return createHash('sha256').update(flowToken, 'utf8').digest('hex')
}

function isExpired(value, nowMs) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) || timestamp <= nowMs
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'method_not_allowed' })
  }

  const { registrationId, flowToken, mimeType, sizeBytes } = request.body || {}

  if (
    typeof registrationId !== 'string' ||
    !UUID_PATTERN.test(registrationId) ||
    typeof flowToken !== 'string' ||
    !FLOW_TOKEN_PATTERN.test(flowToken) ||
    typeof mimeType !== 'string' ||
    !Object.hasOwn(ALLOWED_FILE_TYPES, mimeType) ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_FILE_SIZE_BYTES
  ) {
    return response.status(400).json({ error: 'invalid_request' })
  }

  let supabase

  try {
    supabase = getSupabaseAdmin()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return response.status(503).json({ error: 'service_unavailable' })
    }

    console.error('Document upload URL API initialization failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const flowTokenHash = hashFlowToken(flowToken)

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select(
      [
        'id',
        'status',
        'reservation_expires_at',
        'flow_token_expires_at',
        'payment_started_at',
      ].join(','),
    )
    .eq('id', registrationId)
    .eq('flow_token_hash', flowTokenHash)
    .maybeSingle()

  if (registrationError) {
    console.error('Registration lookup for document upload failed', {
      code: registrationError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!registration) {
    return response.status(404).json({ error: 'registration_not_found' })
  }

  if (registration.status !== 'pending_payment') {
    return response.status(409).json({ error: 'registration_not_pending' })
  }

  const nowMs = Date.now()

  if (
    isExpired(registration.reservation_expires_at, nowMs) ||
    isExpired(registration.flow_token_expires_at, nowMs)
  ) {
    return response.status(410).json({ error: 'registration_expired' })
  }

  if (registration.payment_started_at) {
    return response.status(409).json({ error: 'payment_already_started' })
  }

  const extension = ALLOWED_FILE_TYPES[mimeType]
  const storagePath = `${registrationId}/liability-waiver/${randomUUID()}.${extension}`

  const { data: signedUpload, error: signedUploadError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })

  if (signedUploadError || !signedUpload?.signedUrl || !signedUpload?.path) {
    console.error('Creating signed document upload URL failed', {
      code: signedUploadError?.statusCode ?? signedUploadError?.status ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json({
    bucket: BUCKET,
    path: signedUpload.path,
    signedUrl: signedUpload.signedUrl,
    mimeType,
    sizeBytes,
    expiresInSeconds: 7200,
    nextStep: 'upload_file',
  })
}
