import { createHash } from 'node:crypto'
import { getSupabaseAdmin, SupabaseConfigurationError } from '../_supabase.js'

const BUCKET = 'registration-documents'
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FLOW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const STORAGE_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png)$/i

const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const DOCUMENT_TYPES = {
  liability_waiver: {
    ownerTable: 'children',
    folder: 'liability-waiver',
  },
  health_declaration: {
    ownerTable: 'participants',
    folder: 'health-declaration',
  },
}

function hashFlowToken(flowToken) {
  return createHash('sha256').update(flowToken, 'utf8').digest('hex')
}

function isExpired(value, nowMs) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) || timestamp <= nowMs
}

function normalizeOriginalFilename(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()

  if (
    !normalized ||
    normalized.length > 255 ||
    Array.from(normalized).some((char) => {
      const code = char.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    return null
  }

  return normalized
}

function getContentType(fileInfo) {
  const value =
    fileInfo?.contentType ??
    fileInfo?.content_type ??
    fileInfo?.metadata?.mimetype ??
    fileInfo?.metadata?.contentType ??
    null

  return typeof value === 'string' ? value.toLowerCase() : null
}

function getSize(fileInfo) {
  const value = fileInfo?.size ?? fileInfo?.metadata?.size
  const numericValue = typeof value === 'string' ? Number(value) : value

  return Number.isInteger(numericValue) ? numericValue : null
}

function isValidStoragePath(
  registrationId,
  storagePath,
  documentConfig,
) {
  if (typeof storagePath !== 'string') {
    return false
  }

  const prefix =
    `${registrationId}/${documentConfig.folder}/`

  if (!storagePath.startsWith(prefix)) {
    return false
  }

  const filename = storagePath.slice(prefix.length)

  return STORAGE_FILENAME_PATTERN.test(filename)
}

function sendExistingDocument(response, document, documentType) {
  return response.status(200).json({
    documentId: document.id,
    registrationId: document.registration_id,
    documentType,
    verified: Boolean(document.verified_at),
    nextStep: 'payment',
  })
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'method_not_allowed' })
  }

  const {
    registrationId,
    flowToken,
    storagePath,
    originalFilename,
    documentType = 'liability_waiver',
  } = request.body || {}

  if (
    typeof documentType !== 'string' ||
    !Object.hasOwn(DOCUMENT_TYPES, documentType)
  ) {
    return response.status(400).json({ error: 'invalid_request' })
  }

  const documentConfig = DOCUMENT_TYPES[documentType]

  const normalizedOriginalFilename =
    normalizeOriginalFilename(originalFilename)

  if (
    typeof registrationId !== 'string' ||
    !UUID_PATTERN.test(registrationId) ||
    typeof flowToken !== 'string' ||
    !FLOW_TOKEN_PATTERN.test(flowToken) ||
    !isValidStoragePath(
      registrationId,
      storagePath,
      documentConfig,
    ) ||
    !normalizedOriginalFilename
  ) {
    return response.status(400).json({ error: 'invalid_request' })
  }

  let supabase

  try {
    supabase = getSupabaseAdmin()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return response.status(503).json({
        error: 'service_unavailable',
      })
    }

    console.error('Document confirmation API initialization failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const flowTokenHash = hashFlowToken(flowToken)

  const { data: registration, error: registrationError } =
    await supabase
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
    console.error(
      'Registration lookup for document confirmation failed',
      {
        code: registrationError.code ?? 'unknown',
      },
    )

    return response.status(500).json({ error: 'internal_error' })
  }

  if (!registration) {
    return response.status(404).json({
      error: 'registration_not_found',
    })
  }

  if (registration.status !== 'pending_payment') {
    return response.status(409).json({
      error: 'registration_not_pending',
    })
  }

  const nowMs = Date.now()

  if (
    isExpired(registration.reservation_expires_at, nowMs) ||
    isExpired(registration.flow_token_expires_at, nowMs)
  ) {
    return response.status(410).json({
      error: 'registration_expired',
    })
  }

  if (registration.payment_started_at) {
    return response.status(409).json({
      error: 'payment_already_started',
    })
  }

  const { data: owner, error: ownerError } = await supabase
    .from(documentConfig.ownerTable)
    .select('registration_id')
    .eq('registration_id', registrationId)
    .maybeSingle()

  if (ownerError) {
    console.error('Document owner lookup failed', {
      code: ownerError.code ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  if (!owner) {
    return response.status(409).json({
      error: 'document_type_not_allowed',
    })
  }

  const {
    data: existingByPath,
    error: existingByPathError,
  } = await supabase
    .from('registration_documents')
    .select(
      'id,registration_id,document_type,is_current,verified_at',
    )
    .eq('storage_path', storagePath)
    .maybeSingle()

  if (existingByPathError) {
    console.error('Existing registration document lookup failed', {
      code: existingByPathError.code ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  if (existingByPath) {
    if (
      existingByPath.registration_id !== registrationId ||
      existingByPath.document_type !== documentType
    ) {
      return response.status(409).json({
        error: 'document_conflict',
      })
    }

    return sendExistingDocument(
      response,
      existingByPath,
      documentType,
    )
  }

  const {
    data: currentDocument,
    error: currentDocumentError,
  } = await supabase
    .from('registration_documents')
    .select('id,storage_path')
    .eq('registration_id', registrationId)
    .eq('document_type', documentType)
    .eq('is_current', true)
    .maybeSingle()

  if (currentDocumentError) {
    console.error('Current registration document lookup failed', {
      code: currentDocumentError.code ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  if (currentDocument) {
    return response.status(409).json({
      error: 'document_already_confirmed',
    })
  }

  const { data: fileInfo, error: fileInfoError } =
    await supabase.storage
      .from(BUCKET)
      .info(storagePath)

  if (fileInfoError || !fileInfo) {
    const status =
      fileInfoError?.statusCode ?? fileInfoError?.status

    if (status === 404 || status === '404') {
      return response.status(404).json({
        error: 'uploaded_file_not_found',
      })
    }

    console.error('Reading uploaded document info failed', {
      code: status ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  const actualMimeType = getContentType(fileInfo)
  const actualSizeBytes = getSize(fileInfo)
  const expectedExtension =
    MIME_TO_EXTENSION[actualMimeType]

  const actualExtension =
    storagePath.split('.').pop()?.toLowerCase()

  if (
    !expectedExtension ||
    actualExtension !== expectedExtension ||
    actualSizeBytes === null ||
    actualSizeBytes <= 0 ||
    actualSizeBytes > MAX_FILE_SIZE_BYTES
  ) {
    return response.status(400).json({
      error: 'invalid_uploaded_file',
    })
  }

  const verifiedAt = new Date().toISOString()

  const {
    data: insertedDocument,
    error: insertError,
  } = await supabase
    .from('registration_documents')
    .insert({
      registration_id: registrationId,
      document_type: documentType,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      original_filename: normalizedOriginalFilename,
      mime_type: actualMimeType,
      size_bytes: actualSizeBytes,
      is_current: true,
      verified_at: verifiedAt,
    })
    .select(
      'id,registration_id,document_type,is_current,verified_at',
    )
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retryDocument } = await supabase
        .from('registration_documents')
        .select(
          'id,registration_id,document_type,is_current,verified_at',
        )
        .eq('storage_path', storagePath)
        .maybeSingle()

      if (
        retryDocument &&
        retryDocument.registration_id === registrationId &&
        retryDocument.document_type === documentType
      ) {
        return sendExistingDocument(
          response,
          retryDocument,
          documentType,
        )
      }

      return response.status(409).json({
        error: 'document_already_confirmed',
      })
    }

    console.error('Registration document insert failed', {
      code: insertError.code ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json({
    documentId: insertedDocument.id,
    registrationId,
    documentType,
    verified: true,
    mimeType: actualMimeType,
    sizeBytes: actualSizeBytes,
    nextStep: 'payment',
  })
}