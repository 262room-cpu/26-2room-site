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

function normalizeNullable(value) {
  return value === null || value === 'null' ? null : value
}

function mapEvent(event) {
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

  let supabase

  try {
    supabase = getSupabaseAdmin()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return response
        .status(503)
        .json({ error: 'service_unavailable' })
    }

    console.error('Admin events API initialization failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  const { data: events, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
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
    events: (events ?? []).map(mapEvent),
  })
}