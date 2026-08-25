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
const DEFAULT_REGISTRATION_PAGE_SIZE = 50
const MAX_REGISTRATION_PAGE_SIZE = 100
const REGISTRATION_SEARCH_LIMIT = 2500
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REGISTRATION_STATUSES = new Set([
  'pending_payment',
  'confirmed',
  'expired',
  'cancelled',
])

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
const KIT_SELECT = [
  'id',
  'event_id',
  'code',
  'name',
  'description',
  'image_path',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')
const PARTNER_SELECT = [
  'id',
  'event_id',
  'name',
  'logo_path',
  'website_url',
  'category',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')
const REGISTRATION_LIST_SELECT = [
  'id',
  'distance_id',
  'status',
  'public_id',
  'amount_minor',
  'currency',
  'reserved_at',
  'reservation_expires_at',
  'confirmed_at',
  'created_at',
].join(',')
const REGISTRATION_DETAIL_SELECT = [
  'id',
  'distance_id',
  'status',
  'public_id',
  'amount_minor',
  'currency',
  'reserved_at',
  'reservation_expires_at',
  'payment_started_at',
  'confirmed_at',
  'expired_at',
  'cancelled_at',
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
const KIT_FIELDS = {
  code: { column: 'code', type: 'required_text' },
  name: { column: 'name', type: 'required_text' },
  description: { column: 'description', type: 'nullable_text' },
  imagePath: { column: 'image_path', type: 'nullable_text' },
  sortOrder: { column: 'sort_order', type: 'sort_order' },
}
const PARTNER_FIELDS = {
  name: { column: 'name', type: 'required_text' },
  logoPath: { column: 'logo_path', type: 'nullable_text' },
  websiteUrl: { column: 'website_url', type: 'nullable_text' },
  category: { column: 'category', type: 'nullable_text' },
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

function buildEventItemInsert(body, resource, eventId) {
  const isKit = resource === 'kit'
  const fields = isKit ? KIT_FIELDS : PARTNER_FIELDS
  const errorCode = isKit
    ? 'invalid_kit_data'
    : 'invalid_partner_data'
  const { values } = normalizeRequirementBody(body, fields, errorCode)
  const requiredFields = isKit ? ['code', 'name'] : ['name']

  if (requiredFields.some((field) => !Object.hasOwn(values, field))) {
    throw new RequirementValidationError('required_fields_missing')
  }

  if (isKit) {
    return {
      event_id: eventId,
      code: values.code,
      name: values.name,
      description: values.description ?? null,
      image_path: values.imagePath ?? null,
      sort_order: values.sortOrder ?? 0,
    }
  }

  return {
    event_id: eventId,
    name: values.name,
    logo_path: values.logoPath ?? null,
    website_url: values.websiteUrl ?? null,
    category: values.category ?? null,
    sort_order: values.sortOrder ?? 0,
  }
}

function buildEventItemUpdate(body, resource) {
  const fields = resource === 'kit' ? KIT_FIELDS : PARTNER_FIELDS
  const errorCode = resource === 'kit'
    ? 'invalid_kit_data'
    : 'invalid_partner_data'

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

function mapKitItem(item) {
  return {
    id: item.id,
    eventId: item.event_id,
    code: item.code,
    name: item.name,
    description: item.description,
    imagePath: item.image_path,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapPartner(partner) {
  return {
    id: partner.id,
    eventId: partner.event_id,
    name: partner.name,
    logoPath: partner.logo_path,
    websiteUrl: partner.website_url,
    category: partner.category,
    sortOrder: partner.sort_order,
    createdAt: partner.created_at,
    updatedAt: partner.updated_at,
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

async function handleEventItemRequest({
  request,
  response,
  supabase,
  resource,
  eventId,
  itemId,
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

  if (request.method === 'POST' && itemId) {
    return response
      .status(400)
      .json({ error: 'item_id_not_allowed' })
  }

  if (request.method === 'PATCH' && !itemId) {
    return response
      .status(400)
      .json({ error: 'item_id_required' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin event item owner query failed', {
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

  const isKit = resource === 'kit'
  const table = isKit ? 'event_kit_items' : 'event_partners'
  const select = isKit ? KIT_SELECT : PARTNER_SELECT
  const responseKey = isKit ? 'item' : 'partner'
  const mapItem = isKit ? mapKitItem : mapPartner

  let values

  try {
    values = request.method === 'POST'
      ? buildEventItemInsert(request.body, resource, eventId)
      : buildEventItemUpdate(request.body, resource)
  } catch (error) {
    if (error instanceof RequirementValidationError) {
      return response
        .status(400)
        .json({ error: error.code })
    }

    console.error('Admin event item validation failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  let query = request.method === 'POST'
    ? supabase.from(table).insert(values)
    : supabase
        .from(table)
        .update(values)
        .eq('id', itemId)
        .eq('event_id', eventId)

  query = query.select(select).maybeSingle()

  const { data: item, error: writeError } = await query

  if (writeError) {
    console.error(`Admin ${resource} item write failed`, {
      code: writeError.code ?? 'unknown',
    })

    if (isKit && writeError.code === '23505') {
      return response
        .status(409)
        .json({ error: 'kit_code_conflict' })
    }

    if (['22P02', '22003', '23502', '23514'].includes(writeError.code)) {
      return response.status(400).json({
        error: isKit ? 'invalid_kit_data' : 'invalid_partner_data',
      })
    }

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!item) {
    return response
      .status(404)
      .json({ error: 'item_not_found' })
  }

  return response
    .status(request.method === 'POST' ? 201 : 200)
    .json({ [responseKey]: mapItem(item) })
}

function parsePositiveInteger(value, fallback, max = INTEGER_MAX) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (!/^\d+$/.test(String(value))) {
    return null
  }

  const parsed = Number(value)

  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max
    ? parsed
    : null
}

function joinName(lastName, firstName, middleName) {
  return [lastName, firstName, middleName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
}

function chunkValues(values, size = 200) {
  const chunks = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

async function fetchRowsByRegistrationIds(
  supabase,
  table,
  select,
  registrationIds,
) {
  if (registrationIds.length === 0) {
    return { data: [], error: null }
  }

  const results = await Promise.all(
    chunkValues(registrationIds).map((ids) =>
      supabase
        .from(table)
        .select(select)
        .in('registration_id', ids),
    ),
  )
  const failedResult = results.find(({ error }) => error)

  return failedResult ?? {
    data: results.flatMap(({ data }) => data ?? []),
    error: null,
  }
}

async function loadRegistrationProfiles(supabase, registrations) {
  const registrationIds = registrations.map(({ id }) => id)
  const [participantsResult, childrenResult, parentsResult] =
    await Promise.all([
      fetchRowsByRegistrationIds(
        supabase,
        'participants',
        'registration_id,last_name,first_name,middle_name,phone_display,email_display',
        registrationIds,
      ),
      fetchRowsByRegistrationIds(
        supabase,
        'children',
        'registration_id,last_name,first_name,middle_name',
        registrationIds,
      ),
      fetchRowsByRegistrationIds(
        supabase,
        'parents',
        'registration_id,full_name,phone_display,email_display',
        registrationIds,
      ),
    ])

  if (
    participantsResult.error ||
    childrenResult.error ||
    parentsResult.error
  ) {
    return { error: new Error('profile_query_failed') }
  }

  return {
    error: null,
    participants: new Map(
      participantsResult.data.map((participant) => [
        participant.registration_id,
        participant,
      ]),
    ),
    children: new Map(
      childrenResult.data.map((child) => [child.registration_id, child]),
    ),
    parents: new Map(
      parentsResult.data.map((parent) => [
        parent.registration_id,
        parent,
      ]),
    ),
  }
}

function buildRegistrationProfile(registration, profiles) {
  const adult = profiles.participants.get(registration.id)
  const child = profiles.children.get(registration.id)
  const parent = profiles.parents.get(registration.id)

  if (adult) {
    return {
      participantType: 'adult',
      displayName: joinName(
        adult.last_name,
        adult.first_name,
        adult.middle_name,
      ),
      contactPhone: adult.phone_display,
      contactEmail: adult.email_display,
    }
  }

  if (child) {
    return {
      participantType: 'child',
      displayName: joinName(
        child.last_name,
        child.first_name,
        child.middle_name,
      ),
      contactPhone: parent?.phone_display ?? null,
      contactEmail: parent?.email_display ?? null,
    }
  }

  return {
    participantType: null,
    displayName: 'Участник не указан',
    contactPhone: null,
    contactEmail: null,
  }
}

function registrationMatchesSearch(registration, profile, search) {
  const haystack = [
    registration.public_id,
    profile.displayName,
    profile.contactPhone,
    profile.contactEmail,
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase('ru')

  return haystack.includes(search)
}

function mapRegistrationListRow(
  registration,
  profiles,
  distances,
  groups,
) {
  const profile = buildRegistrationProfile(registration, profiles)
  const distance = distances.get(registration.distance_id)
  const group = distance?.group_id
    ? groups.get(distance.group_id)
    : null

  return {
    id: registration.id,
    publicId: registration.public_id,
    status: registration.status,
    distance: distance
      ? { id: distance.id, title: distance.title }
      : null,
    group: group ? { id: group.id, title: group.title } : null,
    ...profile,
    amountMinor: registration.amount_minor,
    currency: registration.currency,
    reservedAt: registration.reserved_at,
    reservationExpiresAt: registration.reservation_expires_at,
    confirmedAt: registration.confirmed_at,
    createdAt: registration.created_at,
  }
}

async function loadRegistrationSummary(supabase, eventId) {
  const statuses = [
    null,
    'pending_payment',
    'confirmed',
    'expired',
    'cancelled',
  ]
  const results = await Promise.all(
    statuses.map((status) => {
      let query = supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)

      if (status) {
        query = query.eq('status', status)
      }

      return query
    }),
  )

  if (results.some(({ error }) => error)) {
    return { error: new Error('summary_query_failed') }
  }

  return {
    error: null,
    summary: Object.fromEntries(
      statuses.map((status, index) => [
        status ?? 'total',
        results[index].count ?? 0,
      ]),
    ),
  }
}

async function handleRegistrationListRequest({
  request,
  response,
  supabase,
  eventId,
}) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  if (!eventId || !UUID_PATTERN.test(eventId)) {
    return response
      .status(400)
      .json({ error: 'invalid_registration_filters' })
  }

  const page = parsePositiveInteger(
    readQueryParameter(request.query.page),
    1,
  )
  const pageSize = parsePositiveInteger(
    readQueryParameter(request.query.pageSize),
    DEFAULT_REGISTRATION_PAGE_SIZE,
    MAX_REGISTRATION_PAGE_SIZE,
  )
  const status = readQueryParameter(request.query.status)?.trim() || null
  const distanceId =
    readQueryParameter(request.query.distanceId)?.trim() || null
  const search =
    readQueryParameter(request.query.search)?.trim().toLocaleLowerCase('ru') ||
    null

  if (
    page === null ||
    pageSize === null ||
    (status && !REGISTRATION_STATUSES.has(status)) ||
    (distanceId && !UUID_PATTERN.test(distanceId)) ||
    (search && search.length > 120)
  ) {
    return response
      .status(400)
      .json({ error: 'invalid_registration_filters' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin registration event query failed', {
      code: eventError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!event) {
    return response.status(404).json({ error: 'event_not_found' })
  }

  const [distancesResult, groupsResult, summaryResult] = await Promise.all([
    supabase
      .from('event_distances')
      .select('id,title,group_id')
      .eq('event_id', eventId),
    supabase
      .from('event_registration_groups')
      .select('id,title')
      .eq('event_id', eventId),
    loadRegistrationSummary(supabase, eventId),
  ])

  if (distancesResult.error || groupsResult.error || summaryResult.error) {
    console.error('Admin registration metadata query failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  let registrationsQuery = supabase
    .from('registrations')
    .select(REGISTRATION_LIST_SELECT, { count: 'exact' })
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (status) {
    registrationsQuery = registrationsQuery.eq('status', status)
  }

  if (distanceId) {
    registrationsQuery = registrationsQuery.eq('distance_id', distanceId)
  }

  if (search) {
    registrationsQuery = registrationsQuery.limit(
      REGISTRATION_SEARCH_LIMIT,
    )
  } else {
    const offset = (page - 1) * pageSize
    registrationsQuery = registrationsQuery.range(
      offset,
      offset + pageSize - 1,
    )
  }

  const { data: registrations, error: registrationsError, count } =
    await registrationsQuery

  if (registrationsError) {
    console.error('Admin registrations list query failed', {
      code: registrationsError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  const profiles = await loadRegistrationProfiles(
    supabase,
    registrations ?? [],
  )

  if (profiles.error) {
    console.error('Admin registration profile query failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const distanceMap = new Map(
    (distancesResult.data ?? []).map((distance) => [distance.id, distance]),
  )
  const groupMap = new Map(
    (groupsResult.data ?? []).map((group) => [group.id, group]),
  )
  let matchingRegistrations = registrations ?? []

  if (search) {
    matchingRegistrations = matchingRegistrations.filter((registration) =>
      registrationMatchesSearch(
        registration,
        buildRegistrationProfile(registration, profiles),
        search,
      ),
    )
  }

  const total = search ? matchingRegistrations.length : count ?? 0
  const offset = (page - 1) * pageSize
  const pageRegistrations = search
    ? matchingRegistrations.slice(offset, offset + pageSize)
    : matchingRegistrations

  return response.status(200).json({
    rows: pageRegistrations.map((registration) =>
      mapRegistrationListRow(
        registration,
        profiles,
        distanceMap,
        groupMap,
      ),
    ),
    total,
    page,
    pageSize,
    summary: summaryResult.summary,
  })
}

async function addDocumentSignedUrls(supabase, documents) {
  return Promise.all(
    documents.map(async (document) => {
      let signedUrl = null

      if (document.is_current) {
        const { data, error } = await supabase.storage
          .from(document.storage_bucket)
          .createSignedUrl(document.storage_path, 300)

        if (error || !data?.signedUrl) {
          console.error('Admin document signed URL creation failed', {
            code: error?.statusCode ?? error?.status ?? 'unknown',
          })
        } else {
          signedUrl = data.signedUrl
        }
      }

      return {
        documentType: document.document_type,
        originalFilename: document.original_filename,
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        uploadedAt: document.uploaded_at,
        verifiedAt: document.verified_at,
        isCurrent: document.is_current,
        signedUrl,
      }
    }),
  )
}

async function handleRegistrationDetailRequest({
  request,
  response,
  supabase,
  eventId,
  registrationId,
}) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  if (
    !eventId ||
    !UUID_PATTERN.test(eventId) ||
    !registrationId ||
    !UUID_PATTERN.test(registrationId)
  ) {
    return response
      .status(400)
      .json({ error: 'invalid_registration_request' })
  }

  const { data: registration, error: registrationError } =
    await supabase
      .from('registrations')
      .select(REGISTRATION_DETAIL_SELECT)
      .eq('id', registrationId)
      .eq('event_id', eventId)
      .maybeSingle()

  if (registrationError) {
    console.error('Admin registration detail query failed', {
      code: registrationError.code ?? 'unknown',
    })
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!registration) {
    return response
      .status(404)
      .json({ error: 'registration_not_found' })
  }

  const [
    distanceResult,
    participantResult,
    childResult,
    parentResult,
    documentsResult,
    consentsResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from('event_distances')
      .select('id,title,group_id')
      .eq('id', registration.distance_id)
      .eq('event_id', eventId)
      .maybeSingle(),
    supabase
      .from('participants')
      .select(
        'last_name,first_name,middle_name,birth_date,gender,phone_display,email_display',
      )
      .eq('registration_id', registrationId)
      .maybeSingle(),
    supabase
      .from('children')
      .select('last_name,first_name,middle_name,birth_date,gender')
      .eq('registration_id', registrationId)
      .maybeSingle(),
    supabase
      .from('parents')
      .select('full_name,phone_display,email_display')
      .eq('registration_id', registrationId)
      .maybeSingle(),
    supabase
      .from('registration_documents')
      .select(
        'document_type,storage_bucket,storage_path,original_filename,mime_type,size_bytes,is_current,uploaded_at,verified_at',
      )
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false }),
    supabase
      .from('registration_consents')
      .select('consent_type,consent_version,accepted_at')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: true }),
    supabase
      .from('payments')
      .select(
        'provider,provider_payment_id,status,amount_minor,currency,provider_created_at,paid_at,failed_at,cancelled_at,refunded_at,failure_code,created_at',
      )
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false }),
  ])

  const relatedResults = [
    distanceResult,
    participantResult,
    childResult,
    parentResult,
    documentsResult,
    consentsResult,
    paymentsResult,
  ]

  if (relatedResults.some(({ error }) => error)) {
    console.error('Admin registration related data query failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  let group = null

  if (distanceResult.data?.group_id) {
    const { data, error } = await supabase
      .from('event_registration_groups')
      .select('id,title')
      .eq('id', distanceResult.data.group_id)
      .eq('event_id', eventId)
      .maybeSingle()

    if (error) {
      console.error('Admin registration group query failed', {
        code: error.code ?? 'unknown',
      })
      return response.status(500).json({ error: 'internal_error' })
    }

    group = data
  }

  const documents = await addDocumentSignedUrls(
    supabase,
    documentsResult.data ?? [],
  )
  const adult = participantResult.data
  const child = childResult.data
  const parent = parentResult.data

  return response.status(200).json({
    registration: {
      id: registration.id,
      publicId: registration.public_id,
      status: registration.status,
      amountMinor: registration.amount_minor,
      currency: registration.currency,
      reservedAt: registration.reserved_at,
      reservationExpiresAt: registration.reservation_expires_at,
      paymentStartedAt: registration.payment_started_at,
      confirmedAt: registration.confirmed_at,
      expiredAt: registration.expired_at,
      cancelledAt: registration.cancelled_at,
      createdAt: registration.created_at,
      updatedAt: registration.updated_at,
      distance: distanceResult.data
        ? {
            id: distanceResult.data.id,
            title: distanceResult.data.title,
          }
        : null,
      group: group ? { id: group.id, title: group.title } : null,
      participantType: adult ? 'adult' : child ? 'child' : null,
    },
    adult: adult
      ? {
          displayName: joinName(
            adult.last_name,
            adult.first_name,
            adult.middle_name,
          ),
          birthDate: adult.birth_date,
          gender: adult.gender,
          phone: adult.phone_display,
          email: adult.email_display,
        }
      : null,
    child: child
      ? {
          displayName: joinName(
            child.last_name,
            child.first_name,
            child.middle_name,
          ),
          birthDate: child.birth_date,
          gender: child.gender,
          parent: parent
            ? {
                fullName: parent.full_name,
                phone: parent.phone_display,
                email: parent.email_display,
              }
            : null,
        }
      : null,
    documents,
    consents: (consentsResult.data ?? []).map((consent) => ({
      consentType: consent.consent_type,
      consentVersion: consent.consent_version,
      acceptedAt: consent.accepted_at,
    })),
    payments: (paymentsResult.data ?? []).map((payment) => ({
      provider: payment.provider,
      providerPaymentId: payment.provider_payment_id,
      status: payment.status,
      amountMinor: payment.amount_minor,
      currency: payment.currency,
      providerCreatedAt: payment.provider_created_at,
      paidAt: payment.paid_at,
      failedAt: payment.failed_at,
      cancelledAt: payment.cancelled_at,
      refundedAt: payment.refunded_at,
      failureCode: payment.failure_code,
      createdAt: payment.created_at,
    })),
  })
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
  const itemId = readQueryParameter(request.query.itemId)
  const registrationId = readQueryParameter(
    request.query.registrationId,
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
    if (['document', 'consent'].includes(resource)) {
      return handleRequirementRequest({
        request,
        response,
        supabase,
        resource,
        eventId: resourceEventId,
        requirementId,
      })
    }

    if (['kit', 'partner'].includes(resource)) {
      return handleEventItemRequest({
        request,
        response,
        supabase,
        resource,
        eventId: resourceEventId,
        itemId,
      })
    }

    if (resource === 'registrations') {
      return handleRegistrationListRequest({
        request,
        response,
        supabase,
        eventId: resourceEventId,
      })
    }

    if (resource === 'registration') {
      return handleRegistrationDetailRequest({
        request,
        response,
        supabase,
        eventId: resourceEventId,
        registrationId,
      })
    }

    return response
      .status(400)
      .json({ error: 'invalid_resource' })
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
    kitResult,
    partnersResult,
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

    supabase
      .from('event_kit_items')
      .select(KIT_SELECT)
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),

    supabase
      .from('event_partners')
      .select(PARTNER_SELECT)
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
  ])

  if (
    groupsResult.error ||
    distancesResult.error ||
    documentsResult.error ||
    consentsResult.error ||
    kitResult.error ||
    partnersResult.error
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

    kitItems: (kitResult.data ?? []).map(mapKitItem),

    partners: (partnersResult.data ?? []).map(mapPartner),
  })
}
