import {
  AdminAuthConfigurationError,
  isAdminRequest,
} from '../_admin-auth.js'
import {
  getSupabaseAdmin,
  SupabaseConfigurationError,
} from '../_supabase.js'

const SMALLINT_MAX = 32767
const INTEGER_MAX = 2147483647
const DISTANCE_SELECT = [
  'id',
  'event_id',
  'group_id',
  'code',
  'title',
  'distance_meters',
  'min_age',
  'max_age',
  'capacity',
  'price_minor',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')

const EDITABLE_FIELDS = {
  groupId: { column: 'group_id', type: 'group_id' },
  code: { column: 'code', type: 'required_text' },
  title: { column: 'title', type: 'required_text' },
  distanceMeters: {
    column: 'distance_meters',
    type: 'positive_integer',
  },
  minAge: { column: 'min_age', type: 'nullable_smallint' },
  maxAge: { column: 'max_age', type: 'nullable_smallint' },
  capacity: {
    column: 'capacity',
    type: 'nullable_positive_integer',
  },
  priceMinor: {
    column: 'price_minor',
    type: 'nullable_nonnegative_integer',
  },
  sortOrder: { column: 'sort_order', type: 'sort_order' },
}

class DistanceValidationError extends Error {
  constructor(code = 'invalid_distance_data') {
    super(code)
    this.name = 'DistanceValidationError'
    this.code = code
  }
}

function mapDistance(distance) {
  return {
    id: distance.id,
    eventId: distance.event_id,
    groupId: distance.group_id,
    code: distance.code,
    title: distance.title,
    distanceMeters: distance.distance_meters,
    minAge: distance.min_age,
    maxAge: distance.max_age,
    capacity: distance.capacity,
    priceMinor: distance.price_minor,
    sortOrder: distance.sort_order,
    createdAt: distance.created_at,
    updatedAt: distance.updated_at,
  }
}

function normalizeRequiredText(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DistanceValidationError()
  }

  return value.trim()
}

function normalizeInteger(
  value,
  { nullable = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (value === null && nullable) {
    return null
  }

  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new DistanceValidationError()
  }

  return value
}

function normalizeField(field, value) {
  switch (EDITABLE_FIELDS[field].type) {
    case 'group_id':
      if (typeof value !== 'string' || !value.trim()) {
        throw new DistanceValidationError()
      }
      return value.trim()
    case 'required_text':
      return normalizeRequiredText(value)
    case 'positive_integer':
      return normalizeInteger(value, { min: 1, max: INTEGER_MAX })
    case 'nullable_smallint':
      return normalizeInteger(value, {
        nullable: true,
        max: SMALLINT_MAX,
      })
    case 'nullable_positive_integer':
      return normalizeInteger(value, {
        nullable: true,
        min: 1,
        max: INTEGER_MAX,
      })
    case 'nullable_nonnegative_integer':
      return normalizeInteger(value, { nullable: true })
    case 'sort_order':
      return normalizeInteger(value, { max: SMALLINT_MAX })
    default:
      throw new DistanceValidationError('unsupported_field')
  }
}

function normalizeDistanceBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new DistanceValidationError()
  }

  const fields = Object.keys(body)

  if (fields.length === 0) {
    throw new DistanceValidationError('no_changes')
  }

  const values = {}
  const update = {}

  for (const field of fields) {
    const config = EDITABLE_FIELDS[field]

    if (!config) {
      throw new DistanceValidationError('unsupported_field')
    }

    const normalized = normalizeField(field, body[field])
    values[field] = normalized
    update[config.column] = normalized
  }

  return { values, update }
}

function validateAgeRange(minAge, maxAge) {
  if (
    minAge !== null &&
    maxAge !== null &&
    minAge > maxAge
  ) {
    throw new DistanceValidationError('invalid_age_range')
  }
}

function buildDistanceUpdate(body, currentDistance) {
  const { values, update } = normalizeDistanceBody(body)
  const candidate = {
    ...mapDistance(currentDistance),
    ...values,
  }

  validateAgeRange(candidate.minAge, candidate.maxAge)

  return { candidate, update }
}

function buildDistanceInsert(body, eventId) {
  const { values } = normalizeDistanceBody(body)
  const requiredFields = [
    'groupId',
    'code',
    'title',
    'distanceMeters',
  ]

  if (
    requiredFields.some(
      (field) => !Object.hasOwn(values, field),
    )
  ) {
    throw new DistanceValidationError('required_fields_missing')
  }

  const minAge = values.minAge ?? null
  const maxAge = values.maxAge ?? null

  validateAgeRange(minAge, maxAge)

  return {
    event_id: eventId,
    group_id: values.groupId,
    code: values.code,
    title: values.title,
    distance_meters: values.distanceMeters,
    min_age: minAge,
    max_age: maxAge,
    capacity: values.capacity ?? null,
    price_minor: values.priceMinor ?? null,
    sort_order: values.sortOrder ?? 0,
  }
}

function readQueryParameter(value) {
  return Array.isArray(value) ? value[0] : value
}

function isGroupTypeCompatible(eventType, groupType) {
  return eventType === 'mixed' || eventType === groupType
}

async function getEventGroup(supabase, eventId, groupId) {
  return supabase
    .from('event_registration_groups')
    .select('id,registration_form_type')
    .eq('id', groupId)
    .eq('event_id', eventId)
    .maybeSingle()
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Type',
    'application/json; charset=utf-8',
  )

  if (!['POST', 'PATCH'].includes(request.method)) {
    response.setHeader('Allow', 'POST, PATCH')
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

  const eventId = readQueryParameter(request.query.eventId)
  const distanceId = readQueryParameter(request.query.id)

  if (!eventId) {
    return response
      .status(400)
      .json({ error: 'event_id_required' })
  }

  if (request.method === 'PATCH' && !distanceId) {
    return response
      .status(400)
      .json({ error: 'distance_identity_required' })
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

    console.error('Admin distance API initialization failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id,registration_form_type')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin distance event query failed', {
      code: eventError.code ?? 'unknown',
    })

    if (eventError.code === '22P02') {
      return response
        .status(400)
        .json({ error: 'invalid_event_identity' })
    }

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!event) {
    return response
      .status(404)
      .json({ error: 'event_not_found' })
  }

  if (request.method === 'POST') {

    let insert

    try {
      insert = buildDistanceInsert(request.body, eventId)
    } catch (error) {
      if (error instanceof DistanceValidationError) {
        return response
          .status(400)
          .json({ error: error.code })
      }

      console.error('Admin distance validation failed')

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    const { data: group, error: groupError } = await getEventGroup(
      supabase,
      eventId,
      insert.group_id,
    )

    if (groupError) {
      console.error('Admin distance group query failed', {
        code: groupError.code ?? 'unknown',
      })

      if (groupError.code === '22P02') {
        return response
          .status(400)
          .json({ error: 'invalid_group_identity' })
      }

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    if (!group) {
      return response
        .status(404)
        .json({ error: 'group_not_found' })
    }

    if (
      !isGroupTypeCompatible(
        event.registration_form_type,
        group.registration_form_type,
      )
    ) {
      return response
        .status(400)
        .json({ error: 'incompatible_registration_type' })
    }

    const {
      data: createdDistance,
      error: insertError,
    } = await supabase
      .from('event_distances')
      .insert(insert)
      .select(DISTANCE_SELECT)
      .single()

    if (insertError) {
      console.error('Admin distance insert failed', {
        code: insertError.code ?? 'unknown',
      })

      if (insertError.code === '23505') {
        return response
          .status(409)
          .json({ error: 'distance_code_conflict' })
      }

      if (
        ['22P02', '22003', '23514'].includes(insertError.code)
      ) {
        return response
          .status(400)
          .json({ error: 'invalid_distance_data' })
      }

      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    if (!createdDistance) {
      return response
        .status(500)
        .json({ error: 'internal_error' })
    }

    return response.status(201).json({
      distance: mapDistance(createdDistance),
    })
  }

  const { data: distance, error: distanceError } = await supabase
    .from('event_distances')
    .select(DISTANCE_SELECT)
    .eq('id', distanceId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (distanceError) {
    console.error('Admin distance query failed', {
      code: distanceError.code ?? 'unknown',
    })

    if (distanceError.code === '22P02') {
      return response
        .status(400)
        .json({ error: 'invalid_distance_identity' })
    }

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!distance) {
    return response
      .status(404)
      .json({ error: 'distance_not_found' })
  }

  let update
  let candidate

  try {
    ({ update, candidate } = buildDistanceUpdate(
      request.body,
      distance,
    ))
  } catch (error) {
    if (error instanceof DistanceValidationError) {
      return response
        .status(400)
        .json({ error: error.code })
    }

    console.error('Admin distance validation failed')

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  const { data: group, error: groupError } = await getEventGroup(
    supabase,
    eventId,
    candidate.groupId,
  )

  if (groupError) {
    console.error('Admin distance group query failed', {
      code: groupError.code ?? 'unknown',
    })

    if (groupError.code === '22P02') {
      return response
        .status(400)
        .json({ error: 'invalid_group_identity' })
    }

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!group) {
    return response
      .status(404)
      .json({ error: 'group_not_found' })
  }

  if (
    !isGroupTypeCompatible(
      event.registration_form_type,
      group.registration_form_type,
    )
  ) {
    return response
      .status(400)
      .json({ error: 'incompatible_registration_type' })
  }

  const {
    data: updatedDistance,
    error: updateError,
  } = await supabase
    .from('event_distances')
    .update(update)
    .eq('id', distanceId)
    .eq('event_id', eventId)
    .select(DISTANCE_SELECT)
    .maybeSingle()

  if (updateError) {
    console.error('Admin distance update failed', {
      code: updateError.code ?? 'unknown',
    })

    if (updateError.code === '23505') {
      return response
        .status(409)
        .json({ error: 'distance_code_conflict' })
    }

    if (
      ['22P02', '22003', '23514'].includes(updateError.code)
    ) {
      return response
        .status(400)
        .json({ error: 'invalid_distance_data' })
    }

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }

  if (!updatedDistance) {
    return response
      .status(404)
      .json({ error: 'distance_not_found' })
  }

  return response.status(200).json({
    distance: mapDistance(updatedDistance),
  })
}
