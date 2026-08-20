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
const GROUP_TYPES = new Set(['kids', 'participant'])
const GROUP_SELECT = [
  'id',
  'event_id',
  'code',
  'title',
  'registration_form_type',
  'capacity',
  'sort_order',
  'created_at',
  'updated_at',
].join(',')

const EDITABLE_FIELDS = {
  code: { column: 'code', type: 'required_text' },
  title: { column: 'title', type: 'required_text' },
  registrationFormType: {
    column: 'registration_form_type',
    type: 'registration_form_type',
  },
  capacity: {
    column: 'capacity',
    type: 'nullable_positive_integer',
  },
  sortOrder: { column: 'sort_order', type: 'sort_order' },
}

class GroupValidationError extends Error {
  constructor(code = 'invalid_group_data') {
    super(code)
    this.name = 'GroupValidationError'
    this.code = code
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
    throw new GroupValidationError()
  }

  return value
}

function normalizeField(field, value) {
  const config = EDITABLE_FIELDS[field]

  switch (config.type) {
    case 'required_text':
      if (typeof value !== 'string' || !value.trim()) {
        throw new GroupValidationError()
      }
      return value.trim()
    case 'registration_form_type':
      if (typeof value !== 'string' || !GROUP_TYPES.has(value)) {
        throw new GroupValidationError()
      }
      return value
    case 'nullable_positive_integer':
      return normalizeInteger(value, {
        nullable: true,
        min: 1,
        max: INTEGER_MAX,
      })
    case 'sort_order':
      return normalizeInteger(value, { max: SMALLINT_MAX })
    default:
      throw new GroupValidationError('unsupported_field')
  }
}

function normalizeGroupBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GroupValidationError()
  }

  const fields = Object.keys(body)

  if (fields.length === 0) {
    throw new GroupValidationError('no_changes')
  }

  const values = {}
  const update = {}

  for (const field of fields) {
    const config = EDITABLE_FIELDS[field]

    if (!config) {
      throw new GroupValidationError('unsupported_field')
    }

    const normalized = normalizeField(field, body[field])
    values[field] = normalized
    update[config.column] = normalized
  }

  return { values, update }
}

function buildGroupInsert(body, eventId) {
  const { values } = normalizeGroupBody(body)
  const requiredFields = ['code', 'title', 'registrationFormType']

  if (requiredFields.some((field) => !Object.hasOwn(values, field))) {
    throw new GroupValidationError('required_fields_missing')
  }

  return {
    event_id: eventId,
    code: values.code,
    title: values.title,
    registration_form_type: values.registrationFormType,
    capacity: values.capacity ?? null,
    sort_order: values.sortOrder ?? 0,
  }
}

function buildGroupUpdate(body, currentGroup) {
  const { values, update } = normalizeGroupBody(body)

  return {
    candidate: {
      ...mapGroup(currentGroup),
      ...values,
    },
    update,
  }
}

function isGroupTypeCompatible(eventType, groupType) {
  return eventType === 'mixed' || eventType === groupType
}

function readQueryParameter(value) {
  return Array.isArray(value) ? value[0] : value
}

function sendWriteError(response, error, operation) {
  console.error(`Admin group ${operation} failed`, {
    code: error.code ?? 'unknown',
  })

  if (error.code === '23505') {
    return response
      .status(409)
      .json({ error: 'group_code_conflict' })
  }

  if (['22P02', '22003', '23514'].includes(error.code)) {
    return response
      .status(400)
      .json({ error: 'invalid_group_data' })
  }

  return response.status(500).json({ error: 'internal_error' })
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
      return response.status(401).json({ error: 'unauthorized' })
    }
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      return response
        .status(503)
        .json({ error: 'admin_auth_unavailable' })
    }

    console.error('Admin authentication check failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const eventId = readQueryParameter(request.query.eventId)
  const groupId = readQueryParameter(request.query.id)

  if (!eventId) {
    return response.status(400).json({ error: 'event_id_required' })
  }

  if (request.method === 'PATCH' && !groupId) {
    return response.status(400).json({ error: 'group_identity_required' })
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

    console.error('Admin group API initialization failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id,registration_form_type')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    console.error('Admin group event query failed', {
      code: eventError.code ?? 'unknown',
    })

    if (eventError.code === '22P02') {
      return response
        .status(400)
        .json({ error: 'invalid_event_identity' })
    }

    return response.status(500).json({ error: 'internal_error' })
  }

  if (!event) {
    return response.status(404).json({ error: 'event_not_found' })
  }

  if (request.method === 'POST') {
    let insert

    try {
      insert = buildGroupInsert(request.body, eventId)
    } catch (error) {
      if (error instanceof GroupValidationError) {
        return response.status(400).json({ error: error.code })
      }

      console.error('Admin group validation failed')
      return response.status(500).json({ error: 'internal_error' })
    }

    if (
      !isGroupTypeCompatible(
        event.registration_form_type,
        insert.registration_form_type,
      )
    ) {
      return response
        .status(400)
        .json({ error: 'incompatible_registration_type' })
    }

    const { data: createdGroup, error: insertError } = await supabase
      .from('event_registration_groups')
      .insert(insert)
      .select(GROUP_SELECT)
      .single()

    if (insertError) {
      return sendWriteError(response, insertError, 'insert')
    }

    if (!createdGroup) {
      return response.status(500).json({ error: 'internal_error' })
    }

    return response.status(201).json({
      group: mapGroup(createdGroup),
    })
  }

  const { data: group, error: groupError } = await supabase
    .from('event_registration_groups')
    .select(GROUP_SELECT)
    .eq('id', groupId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (groupError) {
    console.error('Admin group query failed', {
      code: groupError.code ?? 'unknown',
    })

    if (groupError.code === '22P02') {
      return response
        .status(400)
        .json({ error: 'invalid_group_identity' })
    }

    return response.status(500).json({ error: 'internal_error' })
  }

  if (!group) {
    return response.status(404).json({ error: 'group_not_found' })
  }

  let update
  let candidate

  try {
    ({ update, candidate } = buildGroupUpdate(request.body, group))
  } catch (error) {
    if (error instanceof GroupValidationError) {
      return response.status(400).json({ error: error.code })
    }

    console.error('Admin group validation failed')
    return response.status(500).json({ error: 'internal_error' })
  }

  if (
    !isGroupTypeCompatible(
      event.registration_form_type,
      candidate.registrationFormType,
    )
  ) {
    return response
      .status(400)
      .json({ error: 'incompatible_registration_type' })
  }

  const { data: updatedGroup, error: updateError } = await supabase
    .from('event_registration_groups')
    .update(update)
    .eq('id', groupId)
    .eq('event_id', eventId)
    .select(GROUP_SELECT)
    .maybeSingle()

  if (updateError) {
    return sendWriteError(response, updateError, 'update')
  }

  if (!updatedGroup) {
    return response.status(404).json({ error: 'group_not_found' })
  }

  return response.status(200).json({
    group: mapGroup(updatedGroup),
  })
}
