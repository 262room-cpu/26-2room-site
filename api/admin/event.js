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

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
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