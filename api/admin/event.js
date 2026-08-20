import {
  AdminAuthConfigurationError,
  isAdminRequest,
} from '../_admin-auth.js'
import {
  getSupabaseAdmin,
  SupabaseConfigurationError,
} from '../_supabase.js'

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
])
const DATE_STATUSES = new Set([
  'tentative',
  'confirmed',
])
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
      if (!Number.isSafeInteger(value) || value <= 0) {
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

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Type',
    'application/json; charset=utf-8',
  )

  if (!['GET', 'PATCH'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PATCH')
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

  if (!eventId) {
    return response
      .status(400)
      .json({ error: 'event_id_required' })
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
    distancesResult,
    documentsResult,
    consentsResult,
  ] = await Promise.all([
    supabase
      .from('event_distances')
      .select(
        'id,code,title,distance_meters,min_age,max_age,capacity,price_minor,sort_order',
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

    distances: (distancesResult.data ?? []).map((distance) => ({
      id: distance.id,
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
