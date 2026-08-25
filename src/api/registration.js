const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])

const EXTENSION_TO_MIME_TYPE = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export class RegistrationFlowError extends Error {
  constructor(code, status = null) {
    super(code)
    this.name = 'RegistrationFlowError'
    this.code = code
    this.status = status
  }
}

function getFileExtension(filename) {
  if (typeof filename !== 'string') {
    return ''
  }

  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    return ''
  }

  return filename.slice(lastDotIndex + 1).toLowerCase()
}

function getUploadMimeType(file) {
  if (ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    return file.type
  }

  return EXTENSION_TO_MIME_TYPE[getFileExtension(file.name)] ?? null
}

function normalizeUploadFile(file, mimeType) {
  if (file.type === mimeType) {
    return file
  }

  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  })
}

async function readJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function postJson(url, body, { headers = {}, signal } = {}) {
  let response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    throw new RegistrationFlowError('network_error')
  }

  const data = await readJsonResponse(response)

  if (!response.ok) {
    throw new RegistrationFlowError(data?.error ?? 'request_failed', response.status)
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RegistrationFlowError('invalid_server_response', response.status)
  }

  return data
}

export async function reserveKidsRegistration(
  {
    eventSlug,
    distanceCode,
    child,
    parent,
    consents,
    idempotencyKey,
  },
  { signal } = {},
) {
  return postJson(
    '/api/registrations/reserve',
    {
      eventSlug,
      distanceCode,
      child,
      parent,
      consents,
    },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      signal,
    },
  )
}

export async function createRegistrationDocumentUpload(
  { registrationId, flowToken, documentType, file },
  { signal } = {},
) {
  const mimeType = getUploadMimeType(file)

  if (!mimeType) {
    throw new RegistrationFlowError('unsupported_file_type')
  }

  const uploadFile = normalizeUploadFile(file, mimeType)

  const uploadInfo = await postJson(
    '/api/registrations/document-upload-url',
    {
      registrationId,
      flowToken,
      mimeType,
      sizeBytes: uploadFile.size,
      documentType,
    },
    { signal },
  )

  if (
    typeof uploadInfo.signedUrl !== 'string' ||
    typeof uploadInfo.path !== 'string' ||
    !uploadInfo.signedUrl ||
    !uploadInfo.path
  ) {
    throw new RegistrationFlowError('invalid_server_response')
  }

  return {
    uploadInfo,
    uploadFile,
  }
}

export async function uploadRegistrationDocument(
  { signedUrl, file },
  { signal } = {},
) {
  const formData = new FormData()
  formData.append('cacheControl', '3600')
  formData.append('', file)

  let response

  try {
    response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'x-upsert': 'false',
      },
      body: formData,
      signal,
    })
  } catch {
    throw new RegistrationFlowError('document_upload_network_error')
  }

  if (!response.ok) {
    throw new RegistrationFlowError('document_upload_failed', response.status)
  }
}

export async function confirmRegistrationDocument(
  {
    registrationId,
    flowToken,
    storagePath,
    originalFilename,
    documentType,
  },
  { signal } = {},
) {
  return postJson(
    '/api/registrations/document-confirm',
    {
      registrationId,
      flowToken,
      storagePath,
      originalFilename,
      documentType,
    },
    { signal },
  )
}
