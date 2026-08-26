export class AdminAuthError extends Error {
  constructor(code, status = null) {
    super(code)
    this.name = 'AdminAuthError'
    this.code = code
    this.status = status
  }
}

async function readJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestJson(
  url,
  {
    method = 'GET',
    body,
    signal,
  } = {},
) {
  let response

  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body
        ? { 'Content-Type': 'application/json' }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch {
    throw new AdminAuthError('network_error')
  }

  const data = await readJsonResponse(response)

  if (!response.ok) {
    throw new AdminAuthError(
      data?.error ?? 'request_failed',
      response.status,
    )
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AdminAuthError(
      'invalid_server_response',
      response.status,
    )
  }

  return data
}

export function getAdminSession({ signal } = {}) {
  return requestJson('/api/admin/session', {
    signal,
  })
}

export function loginAdmin(password, { signal } = {}) {
  return requestJson('/api/admin/login', {
    method: 'POST',
    body: { password },
    signal,
  })
}

export function logoutAdmin({ signal } = {}) {
  return requestJson('/api/admin/logout', {
    method: 'POST',
    signal,
  })
}

export function getAdminEvents({ signal } = {}) {
  return requestJson('/api/admin/event', {
    signal,
  })
}

export function getAdminEvent(eventId, { signal } = {}) {
  const query = new URLSearchParams({
    id: eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    signal,
  })
}

export function createAdminEvent(changes, { signal } = {}) {
  return requestJson('/api/admin/event', {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function deleteAdminEvent(eventId, { signal } = {}) {
  const query = new URLSearchParams({
    id: eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'DELETE',
    signal,
  })
}

export function updateAdminEvent(
  eventId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    id: eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function updateAdminEventPublication(
  eventId,
  action,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'publication',
    eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: { action },
    signal,
  })
}

export function createAdminDocumentRequirement(
  eventId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'document',
    eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function updateAdminDocumentRequirement(
  eventId,
  requirementId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'document',
    eventId,
    requirementId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function createAdminConsentRequirement(
  eventId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'consent',
    eventId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function updateAdminConsentRequirement(
  eventId,
  requirementId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'consent',
    eventId,
    requirementId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function getAdminKitLibrary(eventId, { signal } = {}) {
  const query = new URLSearchParams({ resource: 'kit', eventId })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    signal,
  })
}

export function createAdminKitCatalogItem(eventId, changes, { signal } = {}) {
  const query = new URLSearchParams({ resource: 'kit', eventId })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function updateAdminKitCatalogItem(
  eventId,
  itemId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'kit',
    eventId,
    itemId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function updateAdminKitMembership(
  eventId,
  catalogItemId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'kit-membership',
    eventId,
    itemId: catalogItemId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function createAdminPartner(eventId, changes, { signal } = {}) {
  const query = new URLSearchParams({ resource: 'partner', eventId })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function updateAdminPartner(
  eventId,
  itemId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'partner',
    eventId,
    itemId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function getAdminRegistrations(
  eventId,
  filters = {},
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'registrations',
    eventId,
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 50),
  })

  if (filters.status) {
    query.set('status', filters.status)
  }

  if (filters.distanceId) {
    query.set('distanceId', filters.distanceId)
  }

  if (filters.search) {
    query.set('search', filters.search)
  }

  return requestJson(`/api/admin/event?${query.toString()}`, {
    signal,
  })
}

export function getAdminRegistration(
  eventId,
  registrationId,
  { signal } = {},
) {
  const query = new URLSearchParams({
    resource: 'registration',
    eventId,
    registrationId,
  })

  return requestJson(`/api/admin/event?${query.toString()}`, {
    signal,
  })
}

export function updateAdminDistance(
  eventId,
  distanceId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    eventId,
    id: distanceId,
  })

  return requestJson(`/api/admin/distance?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}

export function createAdminDistance(
  eventId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({ eventId })

  return requestJson(`/api/admin/distance?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function createAdminGroup(
  eventId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({ eventId })

  return requestJson(`/api/admin/group?${query.toString()}`, {
    method: 'POST',
    body: changes,
    signal,
  })
}

export function updateAdminGroup(
  eventId,
  groupId,
  changes,
  { signal } = {},
) {
  const query = new URLSearchParams({
    eventId,
    id: groupId,
  })

  return requestJson(`/api/admin/group?${query.toString()}`, {
    method: 'PATCH',
    body: changes,
    signal,
  })
}
