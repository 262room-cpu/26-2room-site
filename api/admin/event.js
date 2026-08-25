import {
  AdminAuthConfigurationError,
  isAdminRequest,
} from '../_admin-auth.js'
import {
  getSupabaseAdmin,
  SupabaseConfigurationError,
} from '../_supabase.js'

const INTEGER_MAX = 2147483647
const SMALLINT_MAX = 32767

const EVENT_SELECT = [
  'id',
  'slug',
  'registration_code_prefix',
  'title',
  'subtitle',
  'event_type',
  'registration_form_type',
  'status',
  'short_description',
  'description',
  'city',
  'venue',
  'address',
  'timezone',
  'starts_at',
  'tentative_date',
  'date_status',
  'event_window_start',
  'event_window_end',
  'registration_opens_at',
  'registration_closes_at',
  'payment_merchant_account_id',
  'capacity',
  'price_minor',
  'currency',
  'cover_image_path',
  'participant_note',
  'distance_selection_note',
  'created_at',
  'updated_at',
].join(',')

const LIST_EVENT_SELECT = [
  'id',
  'slug',
  'title',
  'subtitle',
  'event_type',
  'registration_form_type',
  'status',
  'city',
  'venue',
  'starts_at',
  'tentative_date',
  'date_status',
  'registration_opens_at',
  'registration_closes_at',
  'capacity',
  'price_minor',
  'currency',
  'created_at',
  'updated_at',
].join(',')

const EVENT_STATUSES = new Set([
  'draft',
  'coming_soon',
  'open',
  'sold_out',
  'closed',
  'finished',
])
const REGISTRATION_FORM_TYPES = new Set([
  'kids',
  'participant',
  'mixed',
])
const DATE_STATUSES = new Set([
  'tentative',
  'confirmed',
])
const CREATE_FIELDS = new Set([
  'slug',
  'title',
  'eventType',
  'registrationFormType',
  'shortDescription',
  'description',
  'city',
  'capacity',
])
const DOCUMENT_SELECT = [
  'id',
  'event_id',
  'document_type',
  'title',
  'description',
  'template_url',
  'required',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')
const CONSENT_SELECT = [
  'id',
  'event_id',
  'consent_type',
  'consent_version',
  'title',
  'body_text',
  'document_url',
  'required',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')
const DOCUMENT_FIELDS = {
  documentType: { column: 'document_type', type: 'required_text' },
  title: { column: 'title', type: 'required_text' },
  description: { column: 'description', type: 'nullable_text' },
  templateUrl: { column: 'template_url', type: 'nullable_text' },
  required: { column: 'required', type: 'boolean' },
  sortOrder: { column: 'sort_order', type: 'sort_order' },
}
const CONSENT_FIELDS = {
  consentType: { column: 'consent_type', type: 'required_text' },
  consentVersion: {
    column: 'consent_version',
    type: 'required_text',
  },
  title: { column: 'title', type: 'required_text' },
  bodyText: { column: 'body_text', type: 'required_text' },
  documentUrl: { column: 'document_url', type: 'nullable_text' },
  required: { column: 'required', type: 'boolean' },
  sortOrder: { column: 'sort_order', type: 'sort_order' },
}
const EDITABLE_FIELDS = {
  title: { column: 'title', type: 'required_text' },
  subtitle: { column: 'subtitle', type: 'nullable_text' },
  registrationCodePrefix: {
    column: 'registration_code_prefix',
    type: 'nullable_text',
  },
  eventType: { column: 'event_type', type: 'required_text' },
  registrationFormType: {
    column: 'registration_form_type',
    type: 'registration_form_type',
  },
  status: { column: 'status', type: 'status' },
  shortDescription: {
    column: 'short_description',
    type: 'required_text',
  },
  description: { column: 'description', type: 'required_text' },
  city: { column: 'city', type: 'required_text' },
  venue: { column: 'venue', type: 'nullable_text' },
  address: { column: 'address', type: 'nullable_text' },
  timezone: { column: 'timezone', type: 'required_text' },
  dateStatus: { column: 'date_status', type: 'date_status' },
  tentativeDate: { column: 'tentative_date', type: 'date' },
  startsAt: { column: 'starts_at', type: 'timestamp' },
  eventWindowStart: {
    column: 'event_window_start',
    type: 'time',
  },
  eventWindowEnd: {
    column: 'event_window_end',
    type: 'time',
  },
  registrationOpensAt: {
    column: 'registration_opens_at',
    type: 'timestamp',
  },
  registrationClosesAt: {
    column: 'registration_closes_at',
    type: 'timestamp',
  },
  capacity: { column: 'capacity', type: 'capacity' },
  priceMinor: { column: 'price_minor', type: 'price_minor' },
  currency: { column: 'currency', type: 'currency' },
  participantNote: {
    column: 'participant_note',
    type: 'nullable_text',
  },
  distanceSelectionNote: {
    column: 'distance_selection_note',
    type: 'nullable_text',
  },
}

class EventValidationError extends Error {
  constructor(code = 'invalid_event_data') {
    super(code)
    this.name = 'EventValidationError'
    this.code = code
  }
}

class RequirementValidationError extends Error {
  constructor(code) {
    super(code)
    this.name = 'RequirementValidationError'
    this.code = code
  }
}

function normalizeText(value, nullable) {
  if (value === null && nullable) {
    return null
  }

  if (typeof value !== 'string') {
    throw new EventValidationError()
  }

  const normalized = value.trim()

  if (!normalized) {
    if (nullable) {
      return null
    }

    throw new EventValidationError()
  }

  return normalized
}

function normalizeRequirementField(value, type, errorCode) {
  switch (type) {
    case 'required_text':
      if (typeof value !== 'string' || !value.trim()) {
        throw new RequirementValidationError(errorCode)
      }
      return value.trim()
    case 'nullable_text':
      if (value === null || value === undefined || value === '') {
        return null
      }
      if (typeof value !== 'string') {
        throw new RequirementValidationError(errorCode)
      }
      return value.trim() || null
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new RequirementValidationError(errorCode)
      }
      return value
    case 'sort_order':
      if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > SMALLINT_MAX
      ) {
        throw new RequirementValidationError(errorCode)
      }
      return value
    default:
      throw new RequirementValidationError('unsupported_field')
  }
}

function normalizeRequirementBody(body, fields, errorCode) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequirementValidationError(errorCode)
  }

  const bodyFields = Object.keys(body)

  if (bodyFields.length === 0) {
    throw new RequirementValidationError('no_changes')
  }

  const values = {}
  const update = {}

  for (const field of bodyFields) {
    const config = fields[field]

    if (!config) {
      throw new RequirementValidationError('unsupported_field')
    }

    const normalized = normalizeRequirementField(
      body[field],
      config.type,
      errorCode,
    )
    values[field] = normalized
    update[config.column] = normalized
  }

  return { values, update }
}

function buildRequirementInsert(body, resource, eventId) {
  const isDocument = resource === 'document'
  const fields = isDocument ? DOCUMENT_FIELDS : CONSENT_FIELDS
  const errorCode = isDocument
    ? 'invalid_document_data'
    : 'invalid_consent_data'
  const { values } = normalizeRequirementBody(body, fields, errorCode)
  const requiredFields = isDocument
    ? ['documentType', 'title', 'required', 'sortOrder']
    : [
        'consentType',
        'consentVersion',
        'title',
        'bodyText',
        'required',
        'sortOrder',
      ]

  if (requiredFields.some((field) => !Object.hasOwn(values, field))) {
    throw new RequirementValidationError('required_fields_missing')
  }

  if (isDocument) {
    return {
      event_id: eventId,
      document_type: values.documentType,
      title: values.title,
      description: values.description ?? null,
      template_url: values.templateUrl ?? null,
      required: values.required,
      sort_order: values.sortOrder,
    }
  }

  return {
    event_id: eventId,
    consent_type: values.consentType,
    consent_version: values.consentVersion,
    title: values.title,
    body_text: values.bodyText,
    document_url: values.documentUrl ?? null,
    required: values.required,
    sort_order: values.sortOrder,
  }
}

function buildRequirementUpdate(body, resource) {
  const fields = resource === 'document'
    ? DOCUMENT_FIELDS
    : CONSENT_FIELDS
  const errorCode = resource === 'document'
    ? 'invalid_document_data'
    : 'invalid_consent_data'

  return normalizeRequirementBody(body, fields, errorCode).update
}

function normalizeDate(value) {
  if (value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new EventValidationError()
  }

  const normalized = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)

  if (!match) {
    throw new EventValidationError()
  }

  const date = new Date(`${normalized}T00:00:00.000Z`)

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new EventValidationError()
  }

  return normalized
}

function normalizeTimestamp(value) {
  if (value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new EventValidationError()
  }

  const normalized = value.trim()

  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new EventValidationError()
  }

  return normalized
}

function normalizeTime(value) {
  if (value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new EventValidationError()
  }

  const normalized = value.trim()

  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(
      normalized,
    )
  ) {
    throw new EventValidationError()
  }

  return normalized
}

function normalizeField(field, value) {
  const config = EDITABLE_FIELDS[field]

  switch (config.type) {
    case 'required_text':
      return normalizeText(value, false)
    case 'nullable_text':
      return normalizeText(value, true)
    case 'registration_form_type':
      if (
        typeof value !== 'string' ||
        !REGISTRATION_FORM_TYPES.has(value)
      ) {
        throw new EventValidationError()
      }
      return value
    case 'status':
      if (typeof value !== 'string' || !EVENT_STATUSES.has(value)) {
        throw new EventValidationError()
      }
      return value
    case 'date_status':
      if (value !== null && !DATE_STATUSES.has(value)) {
        throw new EventValidationError()
      }
      return value
    case 'date':
      return normalizeDate(value)
    case 'timestamp':
      return normalizeTimestamp(value)
    case 'time':
      return normalizeTime(value)
    case 'capacity':
      if (
        !Number.isSafeInteger(value) ||
        value <= 0 ||
        value > INTEGER_MAX
      ) {
        throw new EventValidationError()
      }
      return value
    case 'price_minor':
      if (
        value !== null &&
        (!Number.isSafeInteger(value) || value < 0)
      ) {
        throw new EventValidationError()
      }
      return value
    case 'currency': {
      const currency = normalizeText(value, false)
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new EventValidationError()
      }
      return currency
    }
    default:
      throw new EventValidationError('unsupported_field')
  }
}

function buildEventUpdate(body, currentEvent) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new EventValidationError()
  }

  const fields = Object.keys(body)

  if (fields.length === 0) {
    throw new EventValidationError('no_changes')
  }

  const candidate = mapEvent(currentEvent)
  const update = {}

  for (const field of fields) {
    const config = EDITABLE_FIELDS[field]

    if (!config) {
      throw new EventValidationError('unsupported_field')
    }

    const normalized = normalizeField(field, body[field])
    candidate[field] = normalized
    update[config.column] = normalized
  }

  if (
    candidate.dateStatus === 'tentative' &&
    (!candidate.tentativeDate || candidate.startsAt !== null)
  ) {
    throw new EventValidationError()
  }

  if (
    candidate.dateStatus === 'confirmed' &&
    (!candidate.startsAt || candidate.tentativeDate !== null)
  ) {
    throw new EventValidationError()
  }

  if (
    candidate.dateStatus === null &&
    candidate.tentativeDate !== null
  ) {
    throw new EventValidationError()
  }

  if (
    candidate.status === 'open' &&
    (
      candidate.dateStatus !== 'confirmed' ||
      !candidate.startsAt
    )
  ) {
    throw new EventValidationError()
  }

  const hasEventWindowStart = candidate.eventWindowStart !== null
  const hasEventWindowEnd = candidate.eventWindowEnd !== null

  if (hasEventWindowStart !== hasEventWindowEnd) {
    throw new EventValidationError()
  }

  if (
    candidate.registrationOpensAt &&
    candidate.registrationClosesAt &&
    Date.parse(candidate.registrationClosesAt) <=
      Date.parse(candidate.registrationOpensAt)
  ) {
    throw new EventValidationError()
  }

  return update
}

function buildEventCreate(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new EventValidationError()
  }

  const fields = Object.keys(body)

  if (fields.some((field) => !CREATE_FIELDS.has(field))) {
    throw new EventValidationError('unsupported_field')
  }

  const slug = normalizeText(body.slug, false)

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new EventValidationError('invalid_event_slug')
  }

  const registrationFormType = body.registrationFormType

  if (
    typeof registrationFormType !== 'string' ||
    !REGISTRATION_FORM_TYPES.has(registrationFormType)
  ) {
    throw new EventValidationError()
  }

  const capacity = body.capacity

  if (
    !Number.isSafeInteger(capacity) ||
    capacity <= 0 ||
    capacity > INTEGER_MAX
  ) {
    throw new EventValidationError()
  }

  return {
    slug,
    registration_code_prefix: null,
    title: normalizeText(body.title, false),
    subtitle: null,
    event_type: normalizeText(body.eventType, false),
    registration_form_type: registrationFormType,
    status: 'draft',
    short_description: normalizeText(
      body.shortDescription,
      false,
    ),
    description: normalizeText(body.description, false),
    city: normalizeText(body.city, false),
    venue: null,
    address: null,
    timezone: 'Asia/Almaty',
    starts_at: null,
    tentative_date: null,
    date_status: null,
    event_window_start: null,
    event_window_end: null,
    registration_opens_at: null,
    registration_closes_at: null,
    payment_merchant_account_id: null,
    capacity,
    price_minor: null,
    currency: 'KZT',
    cover_image_path: null,
    participant_note: null,
    distance_selection_note: null,
  }
}

function mapEvent(event) {
  return {
    id: event.id,
    slug: event.slug,
    registrationCodePrefix: event.registration_code_prefix,
    title: event.title,
    subtitle: event.subtitle,
    eventType: event.event_type,
    registrationFormType: event.registration_form_type,
    status: event.status,
    shortDescription: event.short_description,
    description: event.description,
    city: event.city,
    venue: event.venue,
    address: event.address,
    timezone: event.timezone,
    startsAt: event.starts_at,
    tentativeDate: event.tentative_date,
    dateStatus: event.date_status,
    eventWindowStart: event.event_window_start,
    eventWindowEnd: event.event_window_end,
    registrationOpensAt: event.registration_opens_at,
    registrationClosesAt: event.registration_closes_at,
    paymentMerchantAccountId: event.payment_merchant_account_id,
    capacity: event.capacity,
    priceMinor: event.price_minor,
    currency: event.currency,
    coverImagePath: event.cover_image_path,
    participantNote: event.participant_note,
    distanceSelectionNote: event.distance_selection_note,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  }
}

function normalizeNullable(value) {
  return value === null || value === 'null' ? null : value
}

function mapListEvent(event) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: normalizeNullable(event.subtitle),
    eventType: event.event_type,
    registrationFormType: event.registration_form_type,
    status: event.status,
    city: event.city,
    venue: event.venue,
    startsAt: normalizeNullable(event.starts_at),
    tentativeDate: normalizeNullable(event.tentative_date),
    dateStatus: event.date_status,
    registrationOpensAt: normalizeNullable(
      event.registration_opens_at,
    ),
    registrationClosesAt: normalizeNullable(
      event.registration_closes_at,
    ),
    capacity: normalizeNullable(event.capacity),
    priceMinor: normalizeNullable(event.price_minor),
    currency: normalizeNullable(event.currency),
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  }
}

function mapGroup(group) {
  return {
    id: group.id,
    eventId: group.event_id,
    code: group.code,
    title: group.title,
    registrationFormType: group.registration_form_type,
    capacity: group.capacity,
    sortOrder: group.sort_order,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
  }
}

function mapDocumentRequirement(document) {
  return {
    id: document.id,
    eventId: document.event_id,
    documentType: document.document_type,
    title: document.title,
    description: document.description,
    templateUrl: document.template_url,
    required: document.required,
    sortOrder: document.sort_order,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  }
}

function mapConsentRequirement(consent) {
  return {
    id: consent.id,
    eventId: consent.event_id,
    consentType: consent.consent_type,
    consentVersion: consent.consent_version,
    title: consent.title,
    bodyText: consent.body_text,
    documentUrl: consent.document_url,
    required: consent.required,
    sortOrder: consent.sort_order,
    createdAt: consent.created_at,
    updatedAt: consent.updated_at,
  }
}

function readQueryParameter(value) {
  return Array.isArray(value) ? value[0] : value
}

function sendRequirementWriteError(response, error, resource) {
  console.error(`Admin ${resource} requirement write failed`, {
    code: error.code ?? 'unknown',
  })

  if (error.code === '23505') {
    return response.status(409).json({
      error: resource === 'document'
        ? 'document_type_conflict'
        : 'consent_type_conflict',
    })
  }

  if (['22P02', '22003', '23502', '23514'].includes(error.code)) {
    return response.status(400).json({
      error: resource === 'document'
        ? 'invalid_document_data'
        : 'invalid_consent_data',
    })
  }

  return response
    .status(500)
    .json({ error: 'internal_error' })
}

async function handleRequirementRequest({
  request,
  response,
  supabase,
  resource,
  eventId,
  requirementId,
}) {
  if (!['POST', 'PATCH'].includes(request.method)) {
    response.setHeader('Allow', 'POST, PATCH')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  if (!eventId) {
    return response
      .status(400)
      .json({ error: 'event_id_required' })
  }

  if (request.method === 'POST' && requirementId) {
    return response
      .status(400)
      .json({ error: 'requirement_id_not_allowed' })
  }

  if (request.method === 'PATCH' && !requirementId) {
    return response
      .status(400)
      .json({ error: 'requirement_id_required' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin requirement event query failed', {
      code: eventError.code ?? 'unknown',
    })

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!event) {
    return response
      .status(404)
      .json({ error: 'event_not_found' })
  }

  const isDocument = resource === 'document'
  const table = isDocument
    ? 'event_document_requirements'
    : 'event_consent_requirements'
  const select = isDocument ? DOCUMENT_SELECT : CONSENT_SELECT
  const responseKey = isDocument ? 'document' : 'consent'
  const mapRequirement = isDocument
    ? mapDocumentRequirement
    : mapConsentRequirement

  let values

  try {
    values = request.method === 'POST'
      ? buildRequirementInsert(request.body, resource, eventId)
      : buildRequirementUpdate(request.body, resource)
  } catch (error) {
    if (error instanceof RequirementValidationError) {
      return response
        .status(400)
        .json({ error: error.code })
    }

    console.error('Admin requirement validation failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  let query = request.method === 'POST'
    ? supabase.from(table).insert(values)
    : supabase
        .from(table)
        .update(values)
        .eq('id', requirementId)
        .eq('event_id', eventId)

  query = query.select(select).maybeSingle()

  const { data: requirement, error: writeError } = await query

  if (writeError) {
    return sendRequirementWriteError(response, writeError, resource)
  }

  if (!requirement) {
    return response
      .status(404)
      .json({ error: 'requirement_not_found' })
  }

  return response
    .status(request.method === 'POST' ? 201 : 200)
    .json({ [responseKey]: mapRequirement(requirement) })
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Type',
    'application/json; charset=utf-8',
  )

  if (!['GET', 'POST', 'PATCH'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, PATCH')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  try {
    if (!isAdminRequest(request)) {
      return response
        .status(401)
        .json({ error: 'unauthorized' })
    }
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      return response
        .status(503)
        .json({ error: 'admin_auth_unavailable' })
    }

    console.error('Admin authentication check failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  const eventId = Array.isArray(request.query.id)
    ? request.query.id[0]
    : request.query.id
  const resource = readQueryParameter(request.query.resource)
  const resourceEventId = readQueryParameter(request.query.eventId)
  const requirementId = readQueryParameter(
    request.query.requirementId,
  )

  if (request.method === 'POST' && eventId && !resource) {
    return response
      .status(400)
      .json({ error: 'event_id_not_allowed' })
  }

  let supabase

  try {
    supabase = getSupabaseAdmin()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return response
        .status(503)
        .json({ error: 'service_unavailable' })
    }

    console.error('Admin event API initialization failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (resource) {
    if (!['document', 'consent'].includes(resource)) {
      return response
        .status(400)
        .json({ error: 'invalid_resource' })
    }

    return handleRequirementRequest({
      request,
      response,
      supabase,
      resource,
      eventId: resourceEventId,
      requirementId,
    })
  }

  if (request.method === 'POST') {
    let eventToCreate

    try {
      eventToCreate = buildEventCreate(request.body)
    } catch (error) {
      if (error instanceof EventValidationError) {
        return response
          .status(400)
          .json({ error: error.code })
      }

      console.error('Admin event creation validation failed')

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    const { data: createdEvent, error: createError } =
      await supabase
        .from('events')
        .insert(eventToCreate)
        .select(EVENT_SELECT)
        .maybeSingle()

    if (createError) {
      console.error('Admin event creation failed', {
        code: createError.code ?? 'unknown',
      })

      if (createError.code === '23505') {
        return response
          .status(409)
          .json({ error: 'event_slug_conflict' })
      }

      if (['22P02', '23502', '23514'].includes(createError.code)) {
        return response
          .status(400)
          .json({ error: 'invalid_event_data' })
      }

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    if (!createdEvent) {
      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    return response.status(201).json({
      event: mapEvent(createdEvent),
    })
  }

  if (request.method === 'GET' && !eventId) {
    const { data: events, error } = await supabase
      .from('events')
      .select(LIST_EVENT_SELECT)
      .order('updated_at', { ascending: false })
      .order('slug', { ascending: true })

    if (error) {
      console.error('Admin events query failed', {
        code: error.code ?? 'unknown',
      })

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    return response.status(200).json({
      events: (events ?? []).map(mapListEvent),
    })
  }

  if (!eventId) {
    return response
      .status(400)
      .json({ error: 'event_id_required' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin event query failed', {
      code: eventError.code ?? 'unknown',
    })

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!event) {
    return response
      .status(404)
      .json({ error: 'event_not_found' })
  }

  if (request.method === 'PATCH') {
    let update

    try {
      update = buildEventUpdate(request.body, event)
    } catch (error) {
      if (error instanceof EventValidationError) {
        return response
          .status(400)
          .json({ error: error.code })
      }

      console.error('Admin event validation failed')

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    const nextRegistrationFormType = update.registration_form_type

    if (
      nextRegistrationFormType &&
      nextRegistrationFormType !== 'mixed'
    ) {
      const { data: incompatibleGroup, error: groupError } =
        await supabase
          .from('event_registration_groups')
          .select('id')
          .eq('event_id', eventId)
          .neq('registration_form_type', nextRegistrationFormType)
          .limit(1)
          .maybeSingle()

      if (groupError) {
        console.error('Admin event group consistency query failed', {
          code: groupError.code ?? 'unknown',
        })

        return response
          .status(500)
          .json({ error: 'internal_error' })
      }

      if (incompatibleGroup) {
        return response
          .status(400)
          .json({ error: 'incompatible_registration_groups' })
      }
    }

    const {
      data: updatedEvent,
      error: updateError,
    } = await supabase
      .from('events')
      .update(update)
      .eq('id', eventId)
      .select(EVENT_SELECT)
      .maybeSingle()

    if (updateError) {
      console.error('Admin event update failed', {
        code: updateError.code ?? 'unknown',
      })

      if (
        ['22P02', '22007', '23505', '23514'].includes(
          updateError.code,
        )
      ) {
        return response
          .status(400)
          .json({ error: 'invalid_event_data' })
      }

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    if (!updatedEvent) {
      return response
        .status(404)
        .json({ error: 'event_not_found' })
    }

    return response.status(200).json({
      event: mapEvent(updatedEvent),
    })
  }

  const [
    groupsResult,
    distancesResult,
    documentsResult,
    consentsResult,
  ] = await Promise.all([
    supabase
      .from('event_registration_groups')
      .select(
        'id,event_id,code,title,registration_form_type,capacity,sort_order,created_at,updated_at',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('event_distances')
      .select(
        'id,group_id,code,title,distance_meters,min_age,max_age,capacity,price_minor,sort_order',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('event_document_requirements')
      .select(
        'id,document_type,title,description,template_url,required,sort_order',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('event_consent_requirements')
      .select(
        'id,consent_type,consent_version,title,body_text,document_url,required,sort_order',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
  ])

  if (
    groupsResult.error ||
    distancesResult.error ||
    documentsResult.error ||
    consentsResult.error
  ) {
    console.error('Admin event related data query failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  return response.status(200).json({
    event: mapEvent(event),

    groups: (groupsResult.data ?? []).map(mapGroup),

    distances: (distancesResult.data ?? []).map((distance) => ({
      id: distance.id,
      groupId: distance.group_id,
      code: distance.code,
      title: distance.title,
      distanceMeters: distance.distance_meters,
      minAge: distance.min_age,
      maxAge: distance.max_age,
      capacity: distance.capacity,
      priceMinor: distance.price_minor,
      sortOrder: distance.sort_order,
    })),

    documents: (documentsResult.data ?? []).map((document) => ({
      id: document.id,
      documentType: document.document_type,
      title: document.title,
      description: document.description,
      templateUrl: document.template_url,
      required: document.required,
      sortOrder: document.sort_order,
    })),

    consents: (consentsResult.data ?? []).map((consent) => ({
      id: consent.id,
      consentType: consent.consent_type,
      consentVersion: consent.consent_version,
      title: consent.title,
      bodyText: consent.body_text,
      documentUrl: consent.document_url,
      required: consent.required,
      sortOrder: consent.sort_order,
    })),
  })
}
