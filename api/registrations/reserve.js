/* global process */
import { createHash, createHmac } from 'node:crypto'
import { getSupabaseAdmin, SupabaseConfigurationError } from '../_supabase.js'

const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DISTANCE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_REQUIREMENTS = 50

const CONSENT_VERSIONS = {
  eventRules: 'event-rules-2026-08-17-v1',
  personalData: 'personal-data-2026-08-17-v1',
  parentResponsibility: 'parent-responsibility-2026-08-17-v1',
}

const RPC_ERROR_CODES = [
  'event_not_found',
  'event_not_open',
  'event_date_not_confirmed',
  'registration_not_started',
  'registration_closed',
  'distance_not_found',
  'group_sold_out',
  'sold_out',
  'age_not_allowed',
  'invalid_request',
  'idempotency_conflict',
  'invalid_flow_token_hash',
  'flow_token_conflict',
  'invalid_price_config',
  'invalid_event_config',
]

class RegistrationConfigurationError extends Error {
  constructor() {
    super('Registration server configuration is unavailable')
    this.name = 'RegistrationConfigurationError'
  }
}

function getSingleHeader(request, name) {
  const value = request.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

function trimString(value, maxLength) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    return null
  }

  return normalized
}

function optionalTrimmedString(value, maxLength) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return normalized.length <= maxLength ? normalized : undefined
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateConsentPayload(consents) {
  if (!Array.isArray(consents) || consents.length > MAX_REQUIREMENTS) {
    return null
  }

  const normalized = []
  const consentTypes = new Set()

  for (const consent of consents) {
    if (!consent || typeof consent !== 'object' || Array.isArray(consent)) {
      return null
    }

    const consentType = trimString(consent.consentType, 120)
    const consentVersion = trimString(consent.consentVersion, 120)

    if (
      !consentType ||
      !consentVersion ||
      typeof consent.accepted !== 'boolean' ||
      consentTypes.has(consentType)
    ) {
      return null
    }

    consentTypes.add(consentType)
    normalized.push({ consentType, consentVersion, accepted: consent.accepted })
  }

  return normalized
}

function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const eventSlug = trimString(body.eventSlug, 120)
  const distanceCode = trimString(body.distanceCode, 64)
  const child = body.child
  const parent = body.parent
  const consents = body.consents

  if (
    !eventSlug ||
    !EVENT_SLUG_PATTERN.test(eventSlug) ||
    !distanceCode ||
    !DISTANCE_CODE_PATTERN.test(distanceCode) ||
    !child ||
    typeof child !== 'object' ||
    Array.isArray(child) ||
    !parent ||
    typeof parent !== 'object' ||
    Array.isArray(parent) ||
    !Array.isArray(consents)
  ) {
    return null
  }

  const childLastName = trimString(child.lastName, 100)
  const childFirstName = trimString(child.firstName, 100)
  const childMiddleName = optionalTrimmedString(child.middleName, 100)
  const childGender = trimString(child.gender, 16)
  const parentFullName = trimString(parent.fullName, 200)
  const parentPhone = trimString(parent.phone, 40)
  const parentEmail = trimString(parent.email, 254)
  const normalizedConsents = validateConsentPayload(consents)

  if (
    !childLastName ||
    !childFirstName ||
    childMiddleName === undefined ||
    !isValidIsoDate(child.dateOfBirth) ||
    !['male', 'female'].includes(childGender) ||
    !parentFullName ||
    !parentPhone ||
    !parentEmail ||
    !EMAIL_PATTERN.test(parentEmail) ||
    normalizedConsents === null
  ) {
    return null
  }

  const phoneDigits = parentPhone.replace(/\D/g, '')
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return null
  }

  return {
    eventSlug,
    distanceCode,
    childLastName,
    childFirstName,
    childMiddleName,
    childBirthDate: child.dateOfBirth,
    childGender,
    parentFullName,
    parentPhone,
    parentEmail,
    consents: normalizedConsents,
  }
}

function validateConfiguredConsents(clientConsents, requirements) {
  if (clientConsents.length !== requirements.length) {
    return null
  }

  const clientByType = new Map(
    clientConsents.map((consent) => [consent.consentType, consent]),
  )

  const acceptedRequirements = []

  for (const requirement of requirements) {
    const clientConsent = clientByType.get(requirement.consent_type)

    if (
      !clientConsent ||
      clientConsent.consentVersion !== requirement.consent_version ||
      (requirement.required && !clientConsent.accepted)
    ) {
      return null
    }

    if (clientConsent.accepted) {
      acceptedRequirements.push(requirement)
    }
  }

  return acceptedRequirements
}

async function syncRegistrationConsents(
  supabase,
  registrationId,
  acceptedRequirements,
) {
  const { data: existingConsents, error: existingError } = await supabase
    .from('registration_consents')
    .select('consent_type,consent_version')
    .eq('registration_id', registrationId)

  if (existingError) {
    return existingError
  }

  const acceptedTypes = new Set(
    acceptedRequirements.map((requirement) => requirement.consent_type),
  )
  const existingByType = new Map(
    (existingConsents ?? []).map((consent) => [consent.consent_type, consent]),
  )
  const acceptedAt = new Date().toISOString()
  const rowsToUpsert = acceptedRequirements
    .filter(
      (requirement) =>
        existingByType.get(requirement.consent_type)?.consent_version !==
        requirement.consent_version,
    )
    .map((requirement) => ({
      registration_id: registrationId,
      consent_type: requirement.consent_type,
      consent_version: requirement.consent_version,
      accepted_at: acceptedAt,
    }))

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('registration_consents')
      .upsert(rowsToUpsert, { onConflict: 'registration_id,consent_type' })

    if (upsertError) {
      return upsertError
    }
  }

  const staleTypes = (existingConsents ?? [])
    .map((consent) => consent.consent_type)
    .filter((consentType) => !acceptedTypes.has(consentType))

  for (const consentType of staleTypes) {
    const { error: deleteError } = await supabase
      .from('registration_consents')
      .delete()
      .eq('registration_id', registrationId)
      .eq('consent_type', consentType)

    if (deleteError) {
      return deleteError
    }
  }

  return null
}

function getFlowTokenSecret() {
  const secret = process.env.REGISTRATION_FLOW_TOKEN_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new RegistrationConfigurationError()
  }

  return secret
}

function deriveFlowToken(idempotencyKey, secret) {
  return createHmac('sha256', secret)
    .update(`26.2-room-registration:${idempotencyKey}`, 'utf8')
    .digest('base64url')
}

function hashFlowToken(flowToken) {
  return createHash('sha256').update(flowToken, 'utf8').digest('hex')
}

function getRpcErrorCode(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  return RPC_ERROR_CODES.find((code) => text.includes(code)) ?? null
}

function sendRpcError(response, code) {
  if (code === 'event_not_found' || code === 'distance_not_found') {
    return response.status(404).json({ error: code })
  }

  if (code === 'invalid_request' || code === 'age_not_allowed') {
    return response.status(400).json({ error: code })
  }

  if (
    code === 'event_not_open' ||
    code === 'event_date_not_confirmed' ||
    code === 'registration_not_started' ||
    code === 'registration_closed' ||
    code === 'group_sold_out' ||
    code === 'sold_out' ||
    code === 'idempotency_conflict'
  ) {
    return response.status(409).json({ error: code })
  }

  return response.status(500).json({ error: 'internal_error' })
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'method_not_allowed' })
  }

  const idempotencyKey = getSingleHeader(request, 'idempotency-key')?.trim()
  if (!idempotencyKey || !UUID_V4_PATTERN.test(idempotencyKey)) {
    return response.status(400).json({ error: 'invalid_idempotency_key' })
  }

  const payload = validatePayload(request.body)
  if (!payload) {
    return response.status(400).json({ error: 'invalid_request' })
  }

  let supabase
  let flowTokenSecret

  try {
    supabase = getSupabaseAdmin()
    flowTokenSecret = getFlowTokenSecret()
  } catch (error) {
    if (
      error instanceof SupabaseConfigurationError ||
      error instanceof RegistrationConfigurationError
    ) {
      return response.status(503).json({ error: 'service_unavailable' })
    }

    console.error('Registration reserve API initialization failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const flowToken = deriveFlowToken(idempotencyKey, flowTokenSecret)
  const flowTokenHash = hashFlowToken(flowToken)

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('slug', payload.eventSlug)
    .maybeSingle()

  if (eventError) {
    console.error('Registration consent event lookup failed', {
      code: eventError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!event) {
    return response.status(404).json({ error: 'event_not_found' })
  }

  const { data: consentRequirements, error: consentRequirementsError } =
    await supabase
      .from('event_consent_requirements')
      .select('consent_type,consent_version,required')
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true })

  if (consentRequirementsError) {
    console.error('Registration consent requirements lookup failed', {
      code: consentRequirementsError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  const acceptedConsentRequirements = validateConfiguredConsents(
    payload.consents,
    consentRequirements ?? [],
  )

  if (!acceptedConsentRequirements) {
    return response.status(400).json({ error: 'invalid_consents' })
  }

  const consentVersion = (type, fallback) =>
    consentRequirements?.find((requirement) => requirement.consent_type === type)
      ?.consent_version ?? fallback

  const { data, error } = await supabase.rpc('room262_create_registration_reservation', {
    p_event_slug: payload.eventSlug,
    p_distance_code: payload.distanceCode,
    p_child_last_name: payload.childLastName,
    p_child_first_name: payload.childFirstName,
    p_child_middle_name: payload.childMiddleName,
    p_child_birth_date: payload.childBirthDate,
    p_child_gender: payload.childGender,
    p_parent_full_name: payload.parentFullName,
    p_parent_phone: payload.parentPhone,
    p_parent_email: payload.parentEmail,
    p_idempotency_key: idempotencyKey,
    p_flow_token_hash: flowTokenHash,
    p_event_rules_consent_version: consentVersion(
      'event_rules',
      CONSENT_VERSIONS.eventRules,
    ),
    p_personal_data_consent_version: consentVersion(
      'personal_data',
      CONSENT_VERSIONS.personalData,
    ),
    p_parent_responsibility_consent_version: consentVersion(
      'parent_responsibility',
      CONSENT_VERSIONS.parentResponsibility,
    ),
  })

  if (error) {
    const rpcErrorCode = getRpcErrorCode(error)

    if (rpcErrorCode) {
      return sendRpcError(response, rpcErrorCode)
    }

    console.error('Registration reservation RPC failed', {
      code: error?.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  const registration = Array.isArray(data) ? data[0] : data
  if (!registration?.registration_id || !registration?.reservation_expires_at) {
    console.error('Registration reservation RPC returned an unexpected result')
    return response.status(500).json({ error: 'internal_error' })
  }

  const consentSyncError = await syncRegistrationConsents(
    supabase,
    registration.registration_id,
    acceptedConsentRequirements,
  )

  if (consentSyncError) {
    console.error('Registration consent synchronization failed', {
      code: consentSyncError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json({
    status: registration.status,
    registrationId: registration.registration_id,
    flowToken,
    expiresAt: registration.reservation_expires_at,
    amount: {
      minor: registration.amount_minor,
      currency: registration.currency,
    },
    nextStep: 'upload_documents',
  })
}
