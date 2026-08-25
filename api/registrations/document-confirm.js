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

const LEGACY_DOCUMENT_FOLDERS = {
  liability_waiver: 'liability-waiver',
  health_declaration: 'health-declaration',
}

function hashFlowToken(flowToken) {
  return createHash('sha256').update(flowToken, 'utf8').digest('hex')
}

function normalizeDocumentType(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized && normalized.length <= 120 ? normalized : null
}

function getDocumentFolder(documentType) {
  return (
    LEGACY_DOCUMENT_FOLDERS[documentType] ??
    `type-${createHash('sha256').update(documentType, 'utf8').digest('hex').slice(0, 24)}`
  )
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
  documentType,
) {
  if (typeof storagePath !== 'string') {
    return false
  }

  const prefix =
    `${registrationId}/${getDocumentFolder(documentType)}/`

  if (!storagePath.startsWith(prefix)) {
    return false
  }

  const filename = storagePath.slice(prefix.length)

  return STORAGE_FILENAME_PATTERN.test(filename)
}

function sendDocument(response, document, documentType, progress) {
  return response.status(200).json({
    documentId: document.id,
    registrationId: document.registration_id,
    documentType,
    verified: Boolean(document.verified_at),
    requirementsComplete: progress.requirementsComplete,
    remainingDocumentTypes: progress.remainingDocumentTypes,
    nextStep: progress.requirementsComplete ? 'payment' : 'upload_documents',
  })
}

async function getDocumentProgress(supabase, eventId, registrationId) {
  const [requirementsResult, documentsResult] = await Promise.all([
    supabase
      .from('event_document_requirements')
      .select('document_type')
      .eq('event_id', eventId)
      .eq('required', true),
    supabase
      .from('registration_documents')
      .select('document_type')
      .eq('registration_id', registrationId)
      .eq('is_current', true),
  ])

  if (requirementsResult.error || documentsResult.error) {
    return null
  }

  const confirmedTypes = new Set(
    (documentsResult.data ?? []).map((document) => document.document_type),
  )
  const remainingDocumentTypes = (requirementsResult.data ?? [])
    .map((requirement) => requirement.document_type)
    .filter((documentType) => !confirmedTypes.has(documentType))

  return {
    requirementsComplete: remainingDocumentTypes.length === 0,
    remainingDocumentTypes,
  }
}

async function sendDocumentWithProgress(
  response,
  supabase,
  eventId,
  document,
  documentType,
) {
  const progress = await getDocumentProgress(
    supabase,
    eventId,
    document.registration_id,
  )

  if (!progress) {
    console.error('Registration document progress lookup failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  return sendDocument(response, document, documentType, progress)
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
    documentType: rawDocumentType = 'liability_waiver',
  } = request.body || {}
  const documentType = normalizeDocumentType(rawDocumentType)

  if (!documentType) {
    return response.status(400).json({ error: 'invalid_request' })
  }

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
      documentType,
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
          'event_id',
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

  const { data: requirement, error: requirementError } = await supabase
    .from('event_document_requirements')
    .select('document_type')
    .eq('event_id', registration.event_id)
    .eq('document_type', documentType)
    .maybeSingle()

  if (requirementError) {
    console.error('Document requirement lookup failed', {
      code: requirementError.code ?? 'unknown',
    })

    return response.status(500).json({ error: 'internal_error' })
  }

  if (!requirement) {
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

    return sendDocumentWithProgress(
      response,
      supabase,
      registration.event_id,
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
        return sendDocumentWithProgress(
          response,
          supabase,
          registration.event_id,
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

  const progress = await getDocumentProgress(
    supabase,
    registration.event_id,
    registrationId,
  )

  if (!progress) {
    console.error('Registration document progress lookup failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json({
    documentId: insertedDocument.id,
    registrationId,
    documentType,
    verified: true,
    mimeType: actualMimeType,
    sizeBytes: actualSizeBytes,
    requirementsComplete: progress.requirementsComplete,
    remainingDocumentTypes: progress.remainingDocumentTypes,
    nextStep: progress.requirementsComplete ? 'payment' : 'upload_documents',
  })
}
