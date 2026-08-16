import { getSupabaseAdmin, SupabaseConfigurationError } from './_supabase.js'

const MAX_SLUG_LENGTH = 120
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PUBLIC_EVENT_STATUSES = ['coming_soon', 'open', 'sold_out', 'closed', 'finished']

const EVENT_SELECT = [
  'id',
  'slug',
  'title',
  'subtitle',
  'event_type',
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
  'capacity',
  'price_minor',
  'currency',
  'cover_image_path',
  'participant_note',
  'distance_selection_note',
].join(',')

const DISTANCE_SELECT = [
  'code',
  'title',
  'distance_meters',
  'min_age',
  'max_age',
  'capacity',
  'price_minor',
  'sort_order',
].join(',')

const KIT_SELECT = ['code', 'name', 'description', 'image_path', 'sort_order'].join(',')
const PARTNER_SELECT = ['name', 'logo_path', 'website_url', 'category', 'sort_order'].join(',')

function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  )
}

function normalizeTime(value) {
  if (typeof value !== 'string') {
    return value
  }

  return value.replace(/^(\d{2}:\d{2}):00$/, '$1')
}

function mapDistance(distance) {
  return {
    code: distance.code,
    title: distance.title,
    distanceMeters: distance.distance_meters,
    minAge: distance.min_age,
    maxAge: distance.max_age,
    capacity: distance.capacity,
    priceMinor: distance.price_minor,
    sortOrder: distance.sort_order,
  }
}

function mapKitItem(item) {
  return {
    code: item.code,
    name: item.name,
    description: item.description,
    image: item.image_path,
    sortOrder: item.sort_order,
  }
}

function mapPartner(partner) {
  return {
    name: partner.name,
    logoPath: partner.logo_path,
    websiteUrl: partner.website_url,
    category: partner.category,
    sortOrder: partner.sort_order,
  }
}

function mapEvent(event, distances, starterKit, partners) {
  const eventWindow =
    event.event_window_start === null && event.event_window_end === null
      ? null
      : {
          start: normalizeTime(event.event_window_start),
          end: normalizeTime(event.event_window_end),
        }

  return {
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    eventType: event.event_type,
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
    eventWindow,
    registrationOpensAt: event.registration_opens_at,
    registrationClosesAt: event.registration_closes_at,
    capacity: event.capacity,
    priceMinor: event.price_minor,
    currency: event.currency,
    coverImage: event.cover_image_path,
    participantNote: event.participant_note,
    distanceSelectionNote: event.distance_selection_note,
    distances: distances.map(mapDistance),
    starterKit: starterKit.map(mapKitItem),
    partners: partners.map(mapPartner),
  }
}

function logQueryError(stage, error) {
  console.error('Supabase event query failed', {
    stage,
    code: error?.code ?? 'unknown',
  })
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'method_not_allowed' })
  }

  const slug = request.query?.slug

  if (!isValidSlug(slug)) {
    return response.status(400).json({ error: 'invalid_request' })
  }

  let supabase

  try {
    supabase = getSupabaseAdmin()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return response.status(503).json({ error: 'service_unavailable' })
    }

    console.error('Supabase event API initialization failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('slug', slug)
    .in('status', PUBLIC_EVENT_STATUSES)
    .maybeSingle()

  if (eventError) {
    logQueryError('event', eventError)
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!event) {
    return response.status(404).json({ error: 'event_not_found' })
  }

  const [distancesResult, kitResult, partnersResult] = await Promise.all([
    supabase
      .from('event_distances')
      .select(DISTANCE_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('event_kit_items')
      .select(KIT_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('event_partners')
      .select(PARTNER_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
  ])

  const failedChildQuery = [
    ['distances', distancesResult.error],
    ['starter_kit', kitResult.error],
    ['partners', partnersResult.error],
  ].find(([, error]) => error)

  if (failedChildQuery) {
    logQueryError(failedChildQuery[0], failedChildQuery[1])
    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json(
    mapEvent(
      event,
      distancesResult.data ?? [],
      kitResult.data ?? [],
      partnersResult.data ?? [],
    ),
  )
}
