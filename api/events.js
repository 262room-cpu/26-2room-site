import { getSupabaseAdmin, SupabaseConfigurationError } from './_supabase.js'

const MAX_SLUG_LENGTH = 120
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const EVENT_LIST_SELECT = [
  'slug',
  'title',
  'subtitle',
  'event_type',
  'registration_form_type',
  'status',
  'short_description',
  'city',
  'venue',
  'starts_at',
  'tentative_date',
  'date_status',
  'capacity',
  'price_minor',
  'currency',
].join(',')

const EVENT_SELECT = [
  'id',
  'slug',
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
  'capacity',
  'price_minor',
  'currency',
  'cover_image_path',
  'participant_note',
  'distance_selection_note',
].join(',')

const DISTANCE_SELECT = [
  'group_id',
  'code',
  'title',
  'distance_meters',
  'min_age',
  'max_age',
  'capacity',
  'price_minor',
  'sort_order',
].join(',')

const GROUP_SELECT = [
  'id',
  'code',
  'title',
  'registration_form_type',
  'capacity',
  'sort_order',
].join(',')

const KIT_SELECT = ['code', 'name', 'description', 'image_path', 'sort_order'].join(',')
const PARTNER_SELECT = ['name', 'logo_path', 'website_url', 'category', 'sort_order'].join(',')
const DOCUMENT_REQUIREMENT_SELECT = [
  'document_type',
  'title',
  'description',
  'template_url',
  'required',
  'sort_order',
].join(',')
const CONSENT_REQUIREMENT_SELECT = [
  'consent_type',
  'consent_version',
  'title',
  'body_text',
  'document_url',
  'required',
  'sort_order',
].join(',')

function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(slug)
  )
}

function normalizeNullable(value) {
  return value === null || value === 'null' ? null : value
}

function normalizeTime(value) {
  const normalizedValue = normalizeNullable(value)

  if (typeof normalizedValue !== 'string') {
    return normalizedValue
  }

  return normalizedValue.replace(/^(\d{2}:\d{2}):00$/, '$1')
}

function mapDistance(distance) {
  return {
    groupId: distance.group_id,
    code: distance.code,
    title: distance.title,
    distanceMeters: distance.distance_meters,
    minAge: normalizeNullable(distance.min_age),
    maxAge: normalizeNullable(distance.max_age),
    capacity: normalizeNullable(distance.capacity),
    priceMinor: normalizeNullable(distance.price_minor),
    sortOrder: distance.sort_order,
  }
}

function mapRegistrationGroup(group) {
  return {
    id: group.id,
    code: group.code,
    title: group.title,
    registrationFormType: group.registration_form_type,
    capacity: normalizeNullable(group.capacity),
    sortOrder: group.sort_order,
  }
}

function mapKitItem(item) {
  return {
    code: item.code,
    name: item.name,
    description: normalizeNullable(item.description),
    image: normalizeNullable(item.image_path),
    sortOrder: item.sort_order,
  }
}

function mapPartner(partner) {
  return {
    name: partner.name,
    logoPath: normalizeNullable(partner.logo_path),
    websiteUrl: normalizeNullable(partner.website_url),
    category: normalizeNullable(partner.category),
    sortOrder: partner.sort_order,
  }
}

function mapDocumentRequirement(requirement) {
  return {
    documentType: requirement.document_type,
    title: requirement.title,
    description: normalizeNullable(requirement.description),
    templateUrl: normalizeNullable(requirement.template_url),
    required: requirement.required,
    sortOrder: requirement.sort_order,
  }
}

function mapConsentRequirement(requirement) {
  return {
    consentType: requirement.consent_type,
    consentVersion: requirement.consent_version,
    title: requirement.title,
    bodyText: requirement.body_text,
    documentUrl: normalizeNullable(requirement.document_url),
    required: requirement.required,
    sortOrder: requirement.sort_order,
  }
}

export function mapEventListItem(event) {
  return {
    slug: event.slug,
    title: event.title,
    subtitle: normalizeNullable(event.subtitle),
    eventType: event.event_type,
    registrationFormType: event.registration_form_type,
    status: event.status,
    shortDescription: event.short_description,
    city: event.city,
    venue: event.venue,
    startsAt: normalizeNullable(event.starts_at),
    tentativeDate: normalizeNullable(event.tentative_date),
    dateStatus: event.date_status,
    capacity: normalizeNullable(event.capacity),
    priceMinor: normalizeNullable(event.price_minor),
    currency: normalizeNullable(event.currency),
  }
}

export function mapEvent(
  event,
  groups,
  distances,
  starterKit,
  partners,
  documentRequirements = [],
  consentRequirements = [],
) {
  const eventWindowStart = normalizeTime(event.event_window_start)
  const eventWindowEnd = normalizeTime(event.event_window_end)
  const eventWindow =
    eventWindowStart === null && eventWindowEnd === null
      ? null
      : {
          start: eventWindowStart,
          end: eventWindowEnd,
        }

  return {
    slug: event.slug,
    title: event.title,
    subtitle: normalizeNullable(event.subtitle),
    eventType: event.event_type,
    registrationFormType: event.registration_form_type,
    status: event.status,
    shortDescription: event.short_description,
    description: event.description,
    city: event.city,
    venue: event.venue,
    address: normalizeNullable(event.address),
    timezone: event.timezone,
    startsAt: normalizeNullable(event.starts_at),
    tentativeDate: normalizeNullable(event.tentative_date),
    dateStatus: event.date_status,
    eventWindow,
    registrationOpensAt: normalizeNullable(event.registration_opens_at),
    registrationClosesAt: normalizeNullable(event.registration_closes_at),
    capacity: normalizeNullable(event.capacity),
    priceMinor: normalizeNullable(event.price_minor),
    currency: normalizeNullable(event.currency),
    coverImage: normalizeNullable(event.cover_image_path),
    participantNote: normalizeNullable(event.participant_note),
    distanceSelectionNote: normalizeNullable(event.distance_selection_note),
    registrationGroups: groups.map(mapRegistrationGroup),
    distances: distances.map(mapDistance),
    starterKit: starterKit.map(mapKitItem),
    partners: partners.map(mapPartner),
    documentRequirements: documentRequirements.map(mapDocumentRequirement),
    consentRequirements: consentRequirements.map(mapConsentRequirement),
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
  const isListRequest = slug === undefined

  if (!isListRequest && !isValidSlug(slug)) {
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

  if (isListRequest) {
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(EVENT_LIST_SELECT)
      .eq('is_published', true)
      .order('starts_at', { ascending: true, nullsFirst: false })
      .order('tentative_date', { ascending: true, nullsFirst: false })
      .order('slug', { ascending: true })

    if (eventsError) {
      logQueryError('events_list', eventsError)
      return response.status(500).json({ error: 'internal_error' })
    }

    return response.status(200).json((events ?? []).map(mapEventListItem))
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (eventError) {
    logQueryError('event', eventError)
    return response.status(500).json({ error: 'internal_error' })
  }

  if (!event) {
    return response.status(404).json({ error: 'event_not_found' })
  }

  const [
    groupsResult,
    distancesResult,
    kitResult,
    partnersResult,
    documentRequirementsResult,
    consentRequirementsResult,
  ] = await Promise.all([
    supabase
      .from('event_registration_groups')
      .select(GROUP_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
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
    supabase
      .from('event_document_requirements')
      .select(DOCUMENT_REQUIREMENT_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('event_consent_requirements')
      .select(CONSENT_REQUIREMENT_SELECT)
      .eq('event_id', event.id)
      .order('sort_order', { ascending: true }),
  ])

  const failedChildQuery = [
    ['registration_groups', groupsResult.error],
    ['distances', distancesResult.error],
    ['starter_kit', kitResult.error],
    ['partners', partnersResult.error],
    ['document_requirements', documentRequirementsResult.error],
    ['consent_requirements', consentRequirementsResult.error],
  ].find(([, error]) => error)

  if (failedChildQuery) {
    logQueryError(failedChildQuery[0], failedChildQuery[1])
    return response.status(500).json({ error: 'internal_error' })
  }

  return response.status(200).json(
    mapEvent(
      event,
      groupsResult.data ?? [],
      distancesResult.data ?? [],
      kitResult.data ?? [],
      partnersResult.data ?? [],
      documentRequirementsResult.data ?? [],
      consentRequirementsResult.data ?? [],
    ),
  )
}
