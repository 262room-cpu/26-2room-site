import { useEffect, useState } from 'react'
import {
  AdminAuthError,
  createAdminDistance,
  createAdminGroup,
  getAdminEvent,
  getAdminEvents,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  updateAdminDistance,
  updateAdminEvent,
  updateAdminGroup,
} from '../api/admin'
import './AdminPage.css'

const EVENT_STATUS_OPTIONS = [
  ['draft', 'Черновик'],
  ['coming_soon', 'Скоро'],
  ['open', 'Регистрация открыта'],
  ['sold_out', 'Мест нет'],
  ['closed', 'Регистрация закрыта'],
  ['finished', 'Завершено'],
]

const EVENT_STATUS_LABELS = Object.fromEntries(
  EVENT_STATUS_OPTIONS,
)

const REGISTRATION_FORM_OPTIONS = [
  ['kids', 'Детская регистрация'],
  ['participant', 'Взрослая регистрация'],
  ['mixed', 'Смешанная регистрация'],
]

const GROUP_FORM_OPTIONS = REGISTRATION_FORM_OPTIONS.filter(
  ([value]) => value !== 'mixed',
)

class EventFormError extends Error {}

function getTimeZoneFormatter(timezone) {
  const normalizedTimezone =
    typeof timezone === 'string' ? timezone.trim() : ''

  if (!normalizedTimezone) {
    throw new EventFormError(
      'Укажите корректный часовой пояс IANA, например Asia/Almaty.',
    )
  }

  try {
    return {
      formatter: new Intl.DateTimeFormat('en-CA', {
        timeZone: normalizedTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
      timezone: normalizedTimezone,
    }
  } catch {
    throw new EventFormError(
      'Укажите корректный часовой пояс IANA, например Asia/Almaty.',
    )
  }
}

function getZonedDateTimeParts(formatter, date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  )
}

function toDateTimeLocal(value, timezone) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const { formatter } = getTimeZoneFormatter(timezone)
  const parts = getZonedDateTimeParts(formatter, date)

  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-') + `T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

function toIsoTimestamp(value, timezone) {
  if (!value) {
    return null
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    value,
  )

  if (!match) {
    throw new EventFormError('Проверьте дату и время.')
  }

  const [, year, month, day, hour, minute] = match.map(Number)
  const expectedTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  )
  const expectedDate = new Date(expectedTimestamp)

  if (
    expectedDate.getUTCFullYear() !== year ||
    expectedDate.getUTCMonth() !== month - 1 ||
    expectedDate.getUTCDate() !== day ||
    expectedDate.getUTCHours() !== hour ||
    expectedDate.getUTCMinutes() !== minute
  ) {
    throw new EventFormError('Проверьте дату и время.')
  }

  const { formatter } = getTimeZoneFormatter(timezone)
  let timestamp = expectedTimestamp

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedDateTimeParts(
      formatter,
      new Date(timestamp),
    )
    const representedTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    )
    const adjustment = expectedTimestamp - representedTimestamp

    if (adjustment === 0) {
      break
    }

    timestamp += adjustment
  }

  const resolvedParts = getZonedDateTimeParts(
    formatter,
    new Date(timestamp),
  )

  if (
    resolvedParts.year !== year ||
    resolvedParts.month !== month ||
    resolvedParts.day !== day ||
    resolvedParts.hour !== hour ||
    resolvedParts.minute !== minute
  ) {
    throw new EventFormError(
      'Указанное локальное время не существует в часовом поясе мероприятия.',
    )
  }

  return new Date(timestamp).toISOString()
}

function toTimeInput(value) {
  return typeof value === 'string' ? value.slice(0, 5) : ''
}

function priceMinorToInput(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const amount = (value / 100).toFixed(2)
  return amount.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function priceInputToMinor(value) {
  const normalized = value.trim().replace(',', '.')

  if (!normalized) {
    return null
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new EventFormError(
      'Укажите цену числом, максимум с двумя знаками после запятой.',
    )
  }

  const [whole, fraction = ''] = normalized.split('.')
  const amountMinor =
    Number(whole) * 100 + Number(fraction.padEnd(2, '0'))

  if (!Number.isSafeInteger(amountMinor)) {
    throw new EventFormError('Цена слишком большая.')
  }

  return amountMinor
}

function integerInputToValue(
  value,
  {
    label,
    nullable = false,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
  },
) {
  const normalized = value.trim()

  if (!normalized && nullable) {
    return null
  }

  if (!/^\d+$/.test(normalized)) {
    throw new EventFormError(`${label}: укажите целое число.`)
  }

  const number = Number(normalized)

  if (
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  ) {
    throw new EventFormError(`${label}: значение вне допустимого диапазона.`)
  }

  return number
}

function createDistanceForm(distance) {
  return {
    groupId: distance.groupId ?? '',
    code: distance.code ?? '',
    title: distance.title ?? '',
    distanceMeters: String(distance.distanceMeters ?? ''),
    minAge: String(distance.minAge ?? ''),
    maxAge: String(distance.maxAge ?? ''),
    capacity: String(distance.capacity ?? ''),
    price: priceMinorToInput(distance.priceMinor),
    sortOrder: String(distance.sortOrder ?? 0),
  }
}

function createDistanceForms(distances) {
  return Object.fromEntries(
    (Array.isArray(distances) ? distances : []).map((distance) => [
      distance.id,
      createDistanceForm(distance),
    ]),
  )
}

function getNextDistanceSortOrder(distances) {
  if (!Array.isArray(distances) || distances.length === 0) {
    return 0
  }

  const highestSortOrder = Math.max(
    ...distances.map((distance) => distance.sortOrder),
  )

  return highestSortOrder >= 32767 ? null : highestSortOrder + 1
}

function createNewDistanceForm(distances, groups = []) {
  const nextSortOrder = getNextDistanceSortOrder(distances)

  return {
    groupId: groups.length === 1 ? groups[0].id : '',
    title: '',
    code: '',
    distanceMeters: '',
    minAge: '',
    maxAge: '',
    capacity: '',
    price: '',
    sortOrder:
      nextSortOrder === null ? '' : String(nextSortOrder),
  }
}

function buildDistanceChanges(form) {
  const groupId = form.groupId.trim()
  const code = form.code.trim()
  const title = form.title.trim()

  if (!groupId) {
    throw new EventFormError('Выберите группу регистрации.')
  }

  if (!code || !title) {
    throw new EventFormError('Название и код не должны быть пустыми.')
  }

  const minAge = integerInputToValue(form.minAge, {
    label: 'Минимальный возраст',
    nullable: true,
    max: 32767,
  })
  const maxAge = integerInputToValue(form.maxAge, {
    label: 'Максимальный возраст',
    nullable: true,
    max: 32767,
  })

  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    throw new EventFormError(
      'Минимальный возраст не может быть больше максимального.',
    )
  }

  return {
    groupId,
    code,
    title,
    distanceMeters: integerInputToValue(form.distanceMeters, {
      label: 'Дистанция',
      min: 1,
      max: 2147483647,
    }),
    minAge,
    maxAge,
    capacity: integerInputToValue(form.capacity, {
      label: 'Лимит участников',
      nullable: true,
      min: 1,
      max: 2147483647,
    }),
    priceMinor: priceInputToMinor(form.price),
    sortOrder: integerInputToValue(form.sortOrder, {
      label: 'Порядок',
      max: 32767,
    }),
  }
}

function createGroupForm(group) {
  return {
    code: group.code ?? '',
    title: group.title ?? '',
    registrationFormType:
      group.registrationFormType ?? 'participant',
    capacity: String(group.capacity ?? ''),
    sortOrder: String(group.sortOrder ?? 0),
  }
}

function createGroupForms(groups) {
  return Object.fromEntries(
    (Array.isArray(groups) ? groups : []).map((group) => [
      group.id,
      createGroupForm(group),
    ]),
  )
}

function getNextGroupSortOrder(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return 0
  }

  const highestSortOrder = Math.max(
    ...groups.map((group) => group.sortOrder),
  )

  return highestSortOrder >= 32767 ? null : highestSortOrder + 1
}

function createNewGroupForm(groups, eventRegistrationFormType) {
  const nextSortOrder = getNextGroupSortOrder(groups)

  return {
    code: '',
    title: '',
    registrationFormType:
      eventRegistrationFormType === 'participant'
        ? 'participant'
        : 'kids',
    capacity: '',
    sortOrder:
      nextSortOrder === null ? '' : String(nextSortOrder),
  }
}

function buildGroupChanges(form) {
  const code = form.code.trim()
  const title = form.title.trim()

  if (!code || !title) {
    throw new EventFormError('Название и код не должны быть пустыми.')
  }

  if (!['kids', 'participant'].includes(form.registrationFormType)) {
    throw new EventFormError('Выберите тип регистрации группы.')
  }

  return {
    code,
    title,
    registrationFormType: form.registrationFormType,
    capacity: integerInputToValue(form.capacity, {
      label: 'Общий лимит группы',
      nullable: true,
      min: 1,
      max: 2147483647,
    }),
    sortOrder: integerInputToValue(form.sortOrder, {
      label: 'Порядок',
      max: 32767,
    }),
  }
}

function createEventForm(event) {
  const timezone = event.timezone ?? ''

  return {
    title: event.title ?? '',
    subtitle: event.subtitle ?? '',
    registrationCodePrefix: event.registrationCodePrefix ?? '',
    eventType: event.eventType ?? '',
    registrationFormType: event.registrationFormType ?? 'participant',
    status: event.status ?? 'draft',
    shortDescription: event.shortDescription ?? '',
    description: event.description ?? '',
    city: event.city ?? '',
    venue: event.venue ?? '',
    address: event.address ?? '',
    timezone,
    dateStatus: event.dateStatus ?? '',
    tentativeDate: event.tentativeDate ?? '',
    startsAt: toDateTimeLocal(event.startsAt, timezone),
    eventWindowStart: toTimeInput(event.eventWindowStart),
    eventWindowEnd: toTimeInput(event.eventWindowEnd),
    registrationOpensAt: toDateTimeLocal(
      event.registrationOpensAt,
      timezone,
    ),
    registrationClosesAt: toDateTimeLocal(
      event.registrationClosesAt,
      timezone,
    ),
    capacity: String(event.capacity ?? ''),
    price: priceMinorToInput(event.priceMinor),
    currency: event.currency ?? '',
    participantNote: event.participantNote ?? '',
    distanceSelectionNote: event.distanceSelectionNote ?? '',
  }
}

function buildEventChanges(form) {
  const { timezone } = getTimeZoneFormatter(form.timezone)
  const capacity = Number(form.capacity)

  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new EventFormError(
      'Лимит участников должен быть целым положительным числом.',
    )
  }

  const dateStatus = form.dateStatus || null
  const tentativeDate =
    dateStatus === 'tentative' ? form.tentativeDate || null : null
  const startsAt =
    dateStatus === 'confirmed'
      ? toIsoTimestamp(form.startsAt, timezone)
      : null

  if (dateStatus === 'tentative' && !tentativeDate) {
    throw new EventFormError('Укажите предварительную дату.')
  }

  if (dateStatus === 'confirmed' && !startsAt) {
    throw new EventFormError('Укажите подтверждённую дату и время.')
  }

  if (form.status === 'open' && dateStatus !== 'confirmed') {
    throw new EventFormError(
      'Открыть регистрацию можно только для подтверждённой даты.',
    )
  }

  const eventWindowStart = form.eventWindowStart || null
  const eventWindowEnd = form.eventWindowEnd || null

  if (Boolean(eventWindowStart) !== Boolean(eventWindowEnd)) {
    throw new EventFormError(
      'Заполните оба значения временного окна или оставьте оба пустыми.',
    )
  }

  const registrationOpensAt = toIsoTimestamp(
    form.registrationOpensAt,
    timezone,
  )
  const registrationClosesAt = toIsoTimestamp(
    form.registrationClosesAt,
    timezone,
  )

  if (
    registrationOpensAt &&
    registrationClosesAt &&
    Date.parse(registrationClosesAt) <= Date.parse(registrationOpensAt)
  ) {
    throw new EventFormError(
      'Дата закрытия регистрации должна быть позже даты открытия.',
    )
  }

  return {
    title: form.title,
    subtitle: form.subtitle,
    registrationCodePrefix: form.registrationCodePrefix,
    eventType: form.eventType,
    registrationFormType: form.registrationFormType,
    status: form.status,
    shortDescription: form.shortDescription,
    description: form.description,
    city: form.city,
    venue: form.venue,
    address: form.address,
    timezone,
    dateStatus,
    tentativeDate,
    startsAt,
    eventWindowStart,
    eventWindowEnd,
    registrationOpensAt,
    registrationClosesAt,
    capacity,
    priceMinor: priceInputToMinor(form.price),
    currency: form.currency.trim().toUpperCase(),
    participantNote: form.participantNote,
    distanceSelectionNote: form.distanceSelectionNote,
  }
}

function updateEventListItem(event, updatedEvent) {
  return {
    ...event,
    title: updatedEvent.title,
    subtitle: updatedEvent.subtitle,
    eventType: updatedEvent.eventType,
    registrationFormType: updatedEvent.registrationFormType,
    status: updatedEvent.status,
    city: updatedEvent.city,
    venue: updatedEvent.venue,
    startsAt: updatedEvent.startsAt,
    tentativeDate: updatedEvent.tentativeDate,
    dateStatus: updatedEvent.dateStatus,
    registrationOpensAt: updatedEvent.registrationOpensAt,
    registrationClosesAt: updatedEvent.registrationClosesAt,
    capacity: updatedEvent.capacity,
    priceMinor: updatedEvent.priceMinor,
    currency: updatedEvent.currency,
    updatedAt: updatedEvent.updatedAt,
  }
}

function AdminPage() {
  const [sessionStatus, setSessionStatus] = useState('checking')
  const [password, setPassword] = useState('')
  const [loginStatus, setLoginStatus] = useState('idle')
  const [loginMessage, setLoginMessage] = useState('')
  const [logoutStatus, setLogoutStatus] = useState('idle')
  const [logoutMessage, setLogoutMessage] = useState('')
  const [eventsStatus, setEventsStatus] = useState('loading')
  const [events, setEvents] = useState([])
  const [eventsMessage, setEventsMessage] = useState('')
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [eventDetailStatus, setEventDetailStatus] = useState('idle')
  const [eventDetail, setEventDetail] = useState(null)
  const [eventDetailMessage, setEventDetailMessage] = useState('')
  const [eventForm, setEventForm] = useState(null)
  const [eventSaveStatus, setEventSaveStatus] = useState('idle')
  const [eventSaveMessage, setEventSaveMessage] = useState('')
  const [groupForms, setGroupForms] = useState({})
  const [groupSaveStates, setGroupSaveStates] = useState({})
  const [newGroupForm, setNewGroupForm] = useState(() =>
    createNewGroupForm([], 'participant'),
  )
  const [newGroupSaveState, setNewGroupSaveState] = useState({
    status: 'idle',
    message: '',
  })
  const [distanceForms, setDistanceForms] = useState({})
  const [distanceSaveStates, setDistanceSaveStates] = useState({})
  const [newDistanceForm, setNewDistanceForm] = useState(() =>
    createNewDistanceForm([]),
  )
  const [newDistanceSaveState, setNewDistanceSaveState] = useState({
    status: 'idle',
    message: '',
  })

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    getAdminSession({ signal: controller.signal })
      .then((result) => {
        if (isActive) {
          setSessionStatus(result.authenticated === true ? 'authenticated' : 'unauthenticated')
        }
      })
      .catch(() => {
        if (isActive) {
          setSessionStatus('error')
        }
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return undefined
    }

    const controller = new AbortController()
    let isActive = true

    getAdminEvents({ signal: controller.signal })
      .then((result) => {
        if (!isActive) {
          return
        }

        if (!Array.isArray(result.events)) {
          throw new AdminAuthError('invalid_server_response')
        }

        setEvents(result.events)
        setEventsStatus('ready')
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        if (
          error instanceof AdminAuthError &&
          error.status === 401
        ) {
          setEvents([])
          setEventsStatus('idle')
          setSessionStatus('unauthenticated')
          return
        }

        setEvents([])
        setEventsStatus('error')
        setEventsMessage('Не удалось загрузить мероприятия.')
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [sessionStatus])

  const handleSelectEvent = async (eventId) => {
    setSelectedEventId(eventId)
    setEventDetailStatus('loading')
    setEventDetail(null)
    setEventDetailMessage('')
    setEventForm(null)
    setEventSaveStatus('idle')
    setEventSaveMessage('')
    setGroupForms({})
    setGroupSaveStates({})
    setNewGroupForm(createNewGroupForm([], 'participant'))
    setNewGroupSaveState({ status: 'idle', message: '' })
    setDistanceForms({})
    setDistanceSaveStates({})
    setNewDistanceForm(createNewDistanceForm([]))
    setNewDistanceSaveState({ status: 'idle', message: '' })

    try {
      const result = await getAdminEvent(eventId)

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail(result)
      setEventForm(createEventForm(result.event))
      setGroupForms(createGroupForms(result.groups))
      setNewGroupForm(
        createNewGroupForm(
          result.groups,
          result.event.registrationFormType,
        ),
      )
      setDistanceForms(createDistanceForms(result.distances))
      setNewDistanceForm(
        createNewDistanceForm(result.distances, result.groups),
      )
      setEventDetailStatus('ready')
    } catch (error) {
      if (
        error instanceof AdminAuthError &&
        error.status === 401
      ) {
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      setEventDetail(null)
      setGroupForms({})
      setNewGroupForm(createNewGroupForm([], 'participant'))
      setDistanceForms({})
      setNewDistanceForm(createNewDistanceForm([]))
      setEventDetailStatus('error')
      setEventDetailMessage('Не удалось загрузить мероприятие.')
    }
  }

  const handleEventFormChange = (changeEvent) => {
    const { name, value } = changeEvent.target

    setEventForm((currentForm) => {
      if (!currentForm) {
        return currentForm
      }

      if (name === 'dateStatus') {
        return {
          ...currentForm,
          dateStatus: value,
          tentativeDate:
            value === 'tentative' ? currentForm.tentativeDate : '',
          startsAt:
            value === 'confirmed' ? currentForm.startsAt : '',
        }
      }

      return {
        ...currentForm,
        [name]: name === 'currency' ? value.toUpperCase() : value,
      }
    })

    setEventSaveStatus('idle')
    setEventSaveMessage('')
  }

  const handleSaveEvent = async (submitEvent) => {
    submitEvent.preventDefault()

    if (!eventDetail?.event || !eventForm) {
      return
    }

    let changes

    try {
      changes = buildEventChanges(eventForm)
    } catch (error) {
      setEventSaveStatus('error')
      setEventSaveMessage(
        error instanceof EventFormError
          ? error.message
          : 'Проверьте заполненные данные.',
      )
      return
    }

    setEventSaveStatus('saving')
    setEventSaveMessage('')

    try {
      const result = await updateAdminEvent(
        eventDetail.event.id,
        changes,
      )

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        event: result.event,
      }))
      setEventForm(createEventForm(result.event))
      setNewGroupForm((currentForm) => ({
        ...currentForm,
        registrationFormType:
          result.event.registrationFormType === 'mixed'
            ? currentForm.registrationFormType
            : result.event.registrationFormType,
      }))
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === result.event.id
            ? updateEventListItem(event, result.event)
            : event,
        ),
      )
      setEventSaveStatus('success')
      setEventSaveMessage('Сохранено')
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setEventSaveStatus('idle')
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      setEventSaveStatus('error')
      setEventSaveMessage(
        error instanceof AdminAuthError &&
          error.code === 'incompatible_registration_groups'
          ? 'Сначала измените тип несовместимых групп регистрации.'
          : error instanceof AdminAuthError && error.status === 404
            ? 'Мероприятие не найдено.'
            : 'Не удалось сохранить. Проверьте данные и попробуйте ещё раз.',
      )
    }
  }

  const handleGroupFormChange = (groupId, changeEvent) => {
    const { name, value } = changeEvent.target

    setGroupForms((currentForms) => ({
      ...currentForms,
      [groupId]: {
        ...currentForms[groupId],
        [name]: value,
      },
    }))
    setGroupSaveStates((currentStates) => ({
      ...currentStates,
      [groupId]: { status: 'idle', message: '' },
    }))
  }

  const handleSaveGroup = async (submitEvent, groupId) => {
    submitEvent.preventDefault()

    const form = groupForms[groupId]
    const eventId = eventDetail?.event?.id

    if (!form || !eventId) {
      return
    }

    let changes

    try {
      changes = buildGroupChanges(form)
    } catch (error) {
      setGroupSaveStates((currentStates) => ({
        ...currentStates,
        [groupId]: {
          status: 'error',
          message:
            error instanceof EventFormError
              ? error.message
              : 'Проверьте заполненные данные.',
        },
      }))
      return
    }

    setGroupSaveStates((currentStates) => ({
      ...currentStates,
      [groupId]: { status: 'saving', message: '' },
    }))

    try {
      const result = await updateAdminGroup(eventId, groupId, changes)

      if (!result.group || typeof result.group !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        groups: (currentDetail?.groups ?? []).map((group) =>
          group.id === result.group.id ? result.group : group,
        ),
      }))
      setGroupForms((currentForms) => ({
        ...currentForms,
        [groupId]: createGroupForm(result.group),
      }))
      setGroupSaveStates((currentStates) => ({
        ...currentStates,
        [groupId]: { status: 'success', message: 'Сохранено' },
      }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setEventSaveStatus('idle')
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось сохранить группу. Проверьте данные.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'group_code_conflict'
      ) {
        message = 'Группа с таким кодом уже существует.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'incompatible_registration_type'
      ) {
        message = 'Тип группы несовместим с типом регистрации мероприятия.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 404
      ) {
        message = 'Группа не найдена.'
      }

      setGroupSaveStates((currentStates) => ({
        ...currentStates,
        [groupId]: { status: 'error', message },
      }))
    }
  }

  const handleNewGroupFormChange = (changeEvent) => {
    const { name, value } = changeEvent.target

    setNewGroupForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
    setNewGroupSaveState({ status: 'idle', message: '' })
  }

  const handleCreateGroup = async (submitEvent) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const currentGroups = eventDetail?.groups ?? []

    if (!eventId) {
      return
    }

    if (getNextGroupSortOrder(currentGroups) === null) {
      setNewGroupSaveState({
        status: 'error',
        message:
          'Нельзя вычислить следующий порядок: достигнут лимит 32767.',
      })
      return
    }

    let changes

    try {
      changes = buildGroupChanges(newGroupForm)
    } catch (error) {
      setNewGroupSaveState({
        status: 'error',
        message:
          error instanceof EventFormError
            ? error.message
            : 'Проверьте заполненные данные.',
      })
      return
    }

    setNewGroupSaveState({ status: 'saving', message: '' })

    try {
      const result = await createAdminGroup(eventId, changes)

      if (!result.group || typeof result.group !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      const updatedGroups = [...currentGroups, result.group]

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        groups: [...(currentDetail?.groups ?? []), result.group],
      }))
      setGroupForms((currentForms) => ({
        ...currentForms,
        [result.group.id]: createGroupForm(result.group),
      }))
      setNewGroupForm(
        createNewGroupForm(
          updatedGroups,
          eventDetail.event.registrationFormType,
        ),
      )
      setNewDistanceForm((currentForm) => ({
        ...currentForm,
        groupId:
          updatedGroups.length === 1
            ? result.group.id
            : currentForm.groupId,
      }))
      setNewGroupSaveState({
        status: 'success',
        message: 'Группа добавлена',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setEventSaveStatus('idle')
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось добавить группу. Проверьте данные.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'group_code_conflict'
      ) {
        message = 'Группа с таким кодом уже существует.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'incompatible_registration_type'
      ) {
        message = 'Тип группы несовместим с типом регистрации мероприятия.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 404
      ) {
        message = 'Мероприятие не найдено.'
      }

      setNewGroupSaveState({ status: 'error', message })
    }
  }

  const handleDistanceFormChange = (distanceId, changeEvent) => {
    const { name, value } = changeEvent.target

    setDistanceForms((currentForms) => ({
      ...currentForms,
      [distanceId]: {
        ...currentForms[distanceId],
        [name]: value,
      },
    }))
    setDistanceSaveStates((currentStates) => ({
      ...currentStates,
      [distanceId]: { status: 'idle', message: '' },
    }))
  }

  const handleSaveDistance = async (submitEvent, distanceId) => {
    submitEvent.preventDefault()

    const form = distanceForms[distanceId]
    const eventId = eventDetail?.event?.id

    if (!form || !eventId) {
      return
    }

    let changes

    try {
      changes = buildDistanceChanges(form)
    } catch (error) {
      setDistanceSaveStates((currentStates) => ({
        ...currentStates,
        [distanceId]: {
          status: 'error',
          message:
            error instanceof EventFormError
              ? error.message
              : 'Проверьте заполненные данные.',
        },
      }))
      return
    }

    setDistanceSaveStates((currentStates) => ({
      ...currentStates,
      [distanceId]: { status: 'saving', message: '' },
    }))

    try {
      const result = await updateAdminDistance(
        eventId,
        distanceId,
        changes,
      )

      if (!result.distance || typeof result.distance !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        distances: (currentDetail?.distances ?? []).map((distance) =>
          distance.id === result.distance.id
            ? result.distance
            : distance,
        ),
      }))
      setDistanceForms((currentForms) => ({
        ...currentForms,
        [distanceId]: createDistanceForm(result.distance),
      }))
      setDistanceSaveStates((currentStates) => ({
        ...currentStates,
        [distanceId]: { status: 'success', message: 'Сохранено' },
      }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setEventSaveStatus('idle')
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось сохранить дистанцию. Проверьте данные.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'distance_code_conflict'
      ) {
        message = 'Дистанция с таким кодом уже существует.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'incompatible_registration_type'
      ) {
        message = 'Группа дистанции несовместима с типом мероприятия.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'group_not_found'
      ) {
        message = 'Выбранная группа не найдена.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 404
      ) {
        message = 'Дистанция не найдена.'
      }

      setDistanceSaveStates((currentStates) => ({
        ...currentStates,
        [distanceId]: { status: 'error', message },
      }))
    }
  }

  const handleNewDistanceFormChange = (changeEvent) => {
    const { name, value } = changeEvent.target

    setNewDistanceForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
    setNewDistanceSaveState({ status: 'idle', message: '' })
  }

  const handleCreateDistance = async (submitEvent) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const currentDistances = eventDetail?.distances ?? []

    if (!eventId) {
      return
    }

    if (getNextDistanceSortOrder(currentDistances) === null) {
      setNewDistanceSaveState({
        status: 'error',
        message:
          'Нельзя вычислить следующий порядок: достигнут лимит 32767.',
      })
      return
    }

    let changes

    try {
      changes = buildDistanceChanges(newDistanceForm)
    } catch (error) {
      setNewDistanceSaveState({
        status: 'error',
        message:
          error instanceof EventFormError
            ? error.message
            : 'Проверьте заполненные данные.',
      })
      return
    }

    setNewDistanceSaveState({ status: 'saving', message: '' })

    try {
      const result = await createAdminDistance(eventId, changes)

      if (!result.distance || typeof result.distance !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      const updatedDistances = [
        ...currentDistances,
        result.distance,
      ]

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        distances: [
          ...(currentDetail?.distances ?? []),
          result.distance,
        ],
      }))
      setDistanceForms((currentForms) => ({
        ...currentForms,
        [result.distance.id]: createDistanceForm(result.distance),
      }))
      setNewDistanceForm(
        createNewDistanceForm(updatedDistances, eventDetail.groups),
      )
      setNewDistanceSaveState({
        status: 'success',
        message: 'Дистанция добавлена',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setEventSaveStatus('idle')
        setGroupForms({})
        setGroupSaveStates({})
        setNewGroupForm(createNewGroupForm([], 'participant'))
        setNewGroupSaveState({ status: 'idle', message: '' })
        setDistanceForms({})
        setDistanceSaveStates({})
        setNewDistanceForm(createNewDistanceForm([]))
        setNewDistanceSaveState({ status: 'idle', message: '' })
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось добавить дистанцию. Проверьте данные.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'distance_code_conflict'
      ) {
        message = 'Дистанция с таким кодом уже существует.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'incompatible_registration_type'
      ) {
        message = 'Группа дистанции несовместима с типом мероприятия.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'group_not_found'
      ) {
        message = 'Выбранная группа не найдена.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 404
      ) {
        message = 'Мероприятие не найдено.'
      }

      setNewDistanceSaveState({ status: 'error', message })
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    if (!password) {
      setLoginMessage('Введите пароль')
      return
    }

    setLoginStatus('submitting')
    setLoginMessage('')

    try {
      const result = await loginAdmin(password)
      setPassword('')

      if (result.authenticated !== true) {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventsStatus('loading')
      setEventsMessage('')
      setLoginStatus('idle')
      setSessionStatus('authenticated')
    } catch (error) {
      setPassword('')
      setLoginStatus('idle')
      setLoginMessage(
        error instanceof AdminAuthError &&
          (error.code === 'invalid_credentials' || error.status === 401)
          ? 'Неверный пароль'
          : 'Не удалось войти. Попробуйте ещё раз.',
      )
    }
  }

  const handleLogout = async () => {
    setLogoutStatus('submitting')
    setLogoutMessage('')

    try {
      const result = await logoutAdmin()

      if (result.authenticated !== false) {
        throw new AdminAuthError('invalid_server_response')
      }

      setPassword('')
      setLoginMessage('')
      setLogoutStatus('idle')
      setEvents([])
      setSelectedEventId(null)
      setEventDetail(null)
      setEventDetailStatus('idle')
      setEventForm(null)
      setEventSaveStatus('idle')
      setGroupForms({})
      setGroupSaveStates({})
      setNewGroupForm(createNewGroupForm([], 'participant'))
      setNewGroupSaveState({ status: 'idle', message: '' })
      setDistanceForms({})
      setDistanceSaveStates({})
      setNewDistanceForm(createNewDistanceForm([]))
      setNewDistanceSaveState({ status: 'idle', message: '' })
      setSessionStatus('unauthenticated')
    } catch {
      setLogoutStatus('idle')
      setLogoutMessage('Не удалось выйти. Попробуйте ещё раз.')
    }
  }

  const isDistanceSaving =
    newDistanceSaveState.status === 'saving' ||
    Object.values(distanceSaveStates).some(
      ({ status }) => status === 'saving',
    )
  const isGroupSaving =
    newGroupSaveState.status === 'saving' ||
    Object.values(groupSaveStates).some(
      ({ status }) => status === 'saving',
    )
  const isNextGroupSortOrderUnavailable =
    eventDetail !== null &&
    getNextGroupSortOrder(eventDetail.groups) === null
  const isNextDistanceSortOrderUnavailable =
    eventDetail !== null &&
    getNextDistanceSortOrder(eventDetail.distances) === null

  if (sessionStatus === 'checking') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell" aria-busy="true" aria-live="polite">
          <span className="adminLoader" aria-hidden="true" />
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Проверяем сессию</h1>
        </main>
      </div>
    )
  }

  if (sessionStatus === 'error') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell" role="alert">
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Вход временно недоступен</h1>
          <p>Не удалось проверить сессию. Обновите страницу и попробуйте снова.</p>
        </main>
      </div>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <div className="adminPage">
        <main className="adminAuthShell">
          <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
          <h1>Вход в админ-панель</h1>

          <form className="adminLoginForm" onSubmit={handleLogin}>
            <label htmlFor="admin-password">Пароль</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setLoginMessage('')
              }}
              autoComplete="current-password"
              autoFocus
              required
            />

            {loginMessage && (
              <p className="adminAuthMessage" role="alert">
                {loginMessage}
              </p>
            )}

            <button type="submit" disabled={loginStatus === 'submitting'}>
              {loginStatus === 'submitting' ? 'Входим...' : 'Войти'}
            </button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="adminPage">
      <main className="adminPageMain">
        <header className="adminPageHeader">
          <div>
            <p className="adminPageEyebrow">26.2 ROOM · ADMIN</p>
            <h1>Управление мероприятиями</h1>
            <p>
              Здесь будем создавать старты, настраивать регистрацию
              и смотреть участников.
            </p>
          </div>

          <button
            className="adminLogoutButton"
            type="button"
            onClick={handleLogout}
            disabled={logoutStatus === 'submitting'}
          >
            {logoutStatus === 'submitting' ? 'Выходим...' : 'Выйти'}
          </button>
        </header>

        {logoutMessage && (
          <p className="adminAuthMessage adminLogoutMessage" role="alert">
            {logoutMessage}
          </p>
        )}

        <div className="adminPageGrid">
          <section className="adminPageSection">
            <h2>Мероприятия</h2>

            {eventsStatus === 'loading' && (
              <p>Загружаем мероприятия...</p>
            )}

            {eventsStatus === 'error' && (
              <p className="adminAuthMessage">
                {eventsMessage}
              </p>
            )}

            {eventsStatus === 'ready' && events.length === 0 && (
              <p>Мероприятий пока нет.</p>
            )}

            {eventsStatus === 'ready' && events.length > 0 && (
              <div className="adminEventsList">
                {events.map((event) => (
                  <button
                    className="adminEventItem"
                    type="button"
                    key={event.id}
                    onClick={() => handleSelectEvent(event.id)}
                    aria-pressed={selectedEventId === event.id}
                    disabled={
                      eventSaveStatus === 'saving' ||
                      isGroupSaving ||
                      isDistanceSaving
                    }
                  >
                    <strong>{event.title}</strong>
                    <span>{event.city}</span>
                    <span>
                      {EVENT_STATUS_LABELS[event.status] ?? event.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedEventId && (
            <section className="adminPageSection adminEventDetailSection">
              <h2>Карточка мероприятия</h2>

              {eventDetailStatus === 'loading' && (
                <p>Загружаем данные мероприятия...</p>
              )}

              {eventDetailStatus === 'error' && (
                <p className="adminAuthMessage">
                  {eventDetailMessage}
                </p>
              )}

              {eventDetailStatus === 'ready' &&
                eventDetail &&
                eventForm && (
                <>
                <form
                  className="adminEventForm"
                  onSubmit={handleSaveEvent}
                >
                  <div className="adminEventCounts">
                    <span>
                      Групп: {eventDetail.groups?.length ?? 0}
                    </span>
                    <span>
                      Дистанций: {eventDetail.distances?.length ?? 0}
                    </span>
                    <span>
                      Документов: {eventDetail.documents?.length ?? 0}
                    </span>
                    <span>
                      Согласий: {eventDetail.consents?.length ?? 0}
                    </span>
                  </div>

                  <fieldset className="adminEventFormGroup">
                    <legend>Основные данные</legend>
                    <div className="adminEventFormGrid">
                      <label className="adminEventField adminEventFieldWide">
                        <span>Название</span>
                        <input
                          name="title"
                          type="text"
                          value={eventForm.title}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField adminEventFieldWide">
                        <span>Подзаголовок</span>
                        <input
                          name="subtitle"
                          type="text"
                          value={eventForm.subtitle}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Префикс регистрации</span>
                        <input
                          name="registrationCodePrefix"
                          type="text"
                          value={eventForm.registrationCodePrefix}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Тип мероприятия</span>
                        <input
                          name="eventType"
                          type="text"
                          value={eventForm.eventType}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Форма регистрации</span>
                        <select
                          name="registrationFormType"
                          value={eventForm.registrationFormType}
                          onChange={handleEventFormChange}
                        >
                          {REGISTRATION_FORM_OPTIONS.map(
                            ([value, label]) => (
                              <option value={value} key={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                        {eventForm.registrationFormType === 'mixed' && (
                          <small>
                            В одном мероприятии могут одновременно
                            регистрироваться дети и взрослые через разные
                            группы дистанций.
                          </small>
                        )}
                      </label>

                      <label className="adminEventField">
                        <span>Статус</span>
                        <select
                          name="status"
                          value={eventForm.status}
                          onChange={handleEventFormChange}
                        >
                          {EVENT_STATUS_OPTIONS.map(([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="adminEventFormGroup">
                    <legend>Описание</legend>
                    <div className="adminEventFormGrid">
                      <label className="adminEventField adminEventFieldWide">
                        <span>Краткое описание</span>
                        <textarea
                          name="shortDescription"
                          rows="3"
                          value={eventForm.shortDescription}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField adminEventFieldWide">
                        <span>Полное описание</span>
                        <textarea
                          name="description"
                          rows="6"
                          value={eventForm.description}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="adminEventFormGroup">
                    <legend>Место и дата</legend>
                    <div className="adminEventFormGrid">
                      <label className="adminEventField">
                        <span>Город</span>
                        <input
                          name="city"
                          type="text"
                          value={eventForm.city}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Место</span>
                        <input
                          name="venue"
                          type="text"
                          value={eventForm.venue}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField adminEventFieldWide">
                        <span>Адрес</span>
                        <input
                          name="address"
                          type="text"
                          value={eventForm.address}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Часовой пояс</span>
                        <input
                          name="timezone"
                          type="text"
                          value={eventForm.timezone}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Тип даты</span>
                        <select
                          name="dateStatus"
                          value={eventForm.dateStatus}
                          onChange={handleEventFormChange}
                        >
                          <option value="">Дата не указана</option>
                          <option value="tentative">
                            Предварительная дата
                          </option>
                          <option value="confirmed">
                            Подтверждённая дата
                          </option>
                        </select>
                      </label>

                      {eventForm.dateStatus === 'tentative' && (
                        <label className="adminEventField">
                          <span>Предварительная дата</span>
                          <input
                            name="tentativeDate"
                            type="date"
                            value={eventForm.tentativeDate}
                            onChange={handleEventFormChange}
                            required
                          />
                        </label>
                      )}

                      {eventForm.dateStatus === 'confirmed' && (
                        <label className="adminEventField">
                          <span>Подтверждённая дата и время</span>
                          <input
                            name="startsAt"
                            type="datetime-local"
                            value={eventForm.startsAt}
                            onChange={handleEventFormChange}
                            required
                          />
                        </label>
                      )}

                      <label className="adminEventField">
                        <span>Начало временного окна</span>
                        <input
                          name="eventWindowStart"
                          type="time"
                          value={eventForm.eventWindowStart}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Конец временного окна</span>
                        <input
                          name="eventWindowEnd"
                          type="time"
                          value={eventForm.eventWindowEnd}
                          onChange={handleEventFormChange}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="adminEventFormGroup">
                    <legend>Регистрация и стоимость</legend>
                    <div className="adminEventFormGrid">
                      <label className="adminEventField">
                        <span>Открытие регистрации</span>
                        <input
                          name="registrationOpensAt"
                          type="datetime-local"
                          value={eventForm.registrationOpensAt}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Закрытие регистрации</span>
                        <input
                          name="registrationClosesAt"
                          type="datetime-local"
                          value={eventForm.registrationClosesAt}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Лимит участников</span>
                        <input
                          name="capacity"
                          type="number"
                          min="1"
                          step="1"
                          value={eventForm.capacity}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Цена</span>
                        <input
                          name="price"
                          type="text"
                          inputMode="decimal"
                          value={eventForm.price}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Валюта</span>
                        <input
                          name="currency"
                          type="text"
                          maxLength="3"
                          value={eventForm.currency}
                          onChange={handleEventFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField adminEventFieldWide">
                        <span>Примечание для участников</span>
                        <textarea
                          name="participantNote"
                          rows="3"
                          value={eventForm.participantNote}
                          onChange={handleEventFormChange}
                        />
                      </label>

                      <label className="adminEventField adminEventFieldWide">
                        <span>Примечание о выборе дистанции</span>
                        <textarea
                          name="distanceSelectionNote"
                          rows="3"
                          value={eventForm.distanceSelectionNote}
                          onChange={handleEventFormChange}
                        />
                      </label>
                    </div>
                  </fieldset>

                  <div className="adminEventFormActions">
                    <button
                      className="adminEventSaveButton"
                      type="submit"
                      disabled={
                        eventSaveStatus === 'saving' ||
                        isGroupSaving ||
                        isDistanceSaving
                      }
                    >
                      {eventSaveStatus === 'saving'
                        ? 'Сохраняем...'
                        : 'Сохранить'}
                    </button>

                    {eventSaveMessage && (
                      <p
                        className={
                          eventSaveStatus === 'success'
                            ? 'adminSaveSuccess'
                            : 'adminAuthMessage'
                        }
                        role={
                          eventSaveStatus === 'error'
                            ? 'alert'
                            : 'status'
                        }
                      >
                        {eventSaveMessage}
                      </p>
                    )}
                  </div>
                </form>

                <section
                  className="adminDistancesSection adminGroupsSection"
                  aria-labelledby="admin-groups-title"
                >
                  <div className="adminDistancesHeader">
                    <div>
                      <p className="adminPageEyebrow">Регистрация</p>
                      <h3 id="admin-groups-title">
                        Группы регистрации
                      </h3>
                    </div>
                    <span>{eventDetail.groups?.length ?? 0}</span>
                  </div>

                  <p className="adminSectionHint">
                    Лимит группы действует на все дистанции этой группы
                    вместе. Например, лимит 500 для двух детских дистанций
                    означает максимум 500 регистраций суммарно.
                  </p>

                  <form
                    className="adminDistanceCard adminDistanceCreateCard"
                    onSubmit={handleCreateGroup}
                  >
                    <div className="adminDistanceCardHeader">
                      <h4>Добавить группу</h4>
                      <span>Новая</span>
                    </div>

                    <div className="adminGroupFormGrid">
                      <label className="adminEventField adminGroupFieldWide">
                        <span>Название</span>
                        <input
                          name="title"
                          type="text"
                          value={newGroupForm.title}
                          onChange={handleNewGroupFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Код</span>
                        <input
                          name="code"
                          type="text"
                          value={newGroupForm.code}
                          onChange={handleNewGroupFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Тип регистрации</span>
                        <select
                          name="registrationFormType"
                          value={newGroupForm.registrationFormType}
                          onChange={handleNewGroupFormChange}
                        >
                          {GROUP_FORM_OPTIONS.map(([value, label]) => (
                            <option value={value} key={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="adminEventField">
                        <span>Общий лимит группы</span>
                        <input
                          name="capacity"
                          type="number"
                          min="1"
                          max="2147483647"
                          step="1"
                          value={newGroupForm.capacity}
                          onChange={handleNewGroupFormChange}
                        />
                        <small>Пусто — общего лимита группы нет.</small>
                      </label>

                      <label className="adminEventField">
                        <span>Порядок</span>
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          max="32767"
                          step="1"
                          value={newGroupForm.sortOrder}
                          onChange={handleNewGroupFormChange}
                          required
                        />
                      </label>
                    </div>

                    <div className="adminEventFormActions">
                      <button
                        className="adminEventSaveButton"
                        type="submit"
                        disabled={
                          eventSaveStatus === 'saving' ||
                          isGroupSaving ||
                          isDistanceSaving ||
                          isNextGroupSortOrderUnavailable
                        }
                      >
                        {newGroupSaveState.status === 'saving'
                          ? 'Добавляем...'
                          : 'Добавить группу'}
                      </button>

                      {newGroupSaveState.message && (
                        <p
                          className={
                            newGroupSaveState.status === 'success'
                              ? 'adminSaveSuccess'
                              : 'adminAuthMessage'
                          }
                          role={
                            newGroupSaveState.status === 'error'
                              ? 'alert'
                              : 'status'
                          }
                        >
                          {newGroupSaveState.message}
                        </p>
                      )}
                    </div>

                    {isNextGroupSortOrderUnavailable && (
                      <p className="adminAuthMessage" role="alert">
                        Нельзя вычислить следующий порядок: достигнут
                        лимит 32767.
                      </p>
                    )}
                  </form>

                  {(eventDetail.groups?.length ?? 0) === 0 && (
                    <p>У мероприятия пока нет групп регистрации.</p>
                  )}

                  {(eventDetail.groups?.length ?? 0) > 0 && (
                    <div className="adminDistanceCards">
                      {eventDetail.groups.map((group) => {
                        const form = groupForms[group.id]
                        const saveState = groupSaveStates[group.id] ?? {
                          status: 'idle',
                          message: '',
                        }

                        if (!form) {
                          return null
                        }

                        return (
                          <form
                            className="adminDistanceCard"
                            key={group.id}
                            onSubmit={(submitEvent) =>
                              handleSaveGroup(submitEvent, group.id)
                            }
                          >
                            <div className="adminDistanceCardHeader">
                              <h4>{form.title || 'Без названия'}</h4>
                              <span>{form.code || 'Без кода'}</span>
                            </div>

                            <div className="adminGroupFormGrid">
                              <label className="adminEventField adminGroupFieldWide">
                                <span>Название</span>
                                <input
                                  name="title"
                                  type="text"
                                  value={form.title}
                                  onChange={(changeEvent) =>
                                    handleGroupFormChange(
                                      group.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Код</span>
                                <input
                                  name="code"
                                  type="text"
                                  value={form.code}
                                  onChange={(changeEvent) =>
                                    handleGroupFormChange(
                                      group.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Тип регистрации</span>
                                <select
                                  name="registrationFormType"
                                  value={form.registrationFormType}
                                  onChange={(changeEvent) =>
                                    handleGroupFormChange(
                                      group.id,
                                      changeEvent,
                                    )
                                  }
                                >
                                  {GROUP_FORM_OPTIONS.map(
                                    ([value, label]) => (
                                      <option value={value} key={value}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>

                              <label className="adminEventField">
                                <span>Общий лимит группы</span>
                                <input
                                  name="capacity"
                                  type="number"
                                  min="1"
                                  max="2147483647"
                                  step="1"
                                  value={form.capacity}
                                  onChange={(changeEvent) =>
                                    handleGroupFormChange(
                                      group.id,
                                      changeEvent,
                                    )
                                  }
                                />
                                <small>
                                  Пусто — общего лимита группы нет.
                                </small>
                              </label>

                              <label className="adminEventField">
                                <span>Порядок</span>
                                <input
                                  name="sortOrder"
                                  type="number"
                                  min="0"
                                  max="32767"
                                  step="1"
                                  value={form.sortOrder}
                                  onChange={(changeEvent) =>
                                    handleGroupFormChange(
                                      group.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>
                            </div>

                            <div className="adminEventFormActions">
                              <button
                                className="adminEventSaveButton"
                                type="submit"
                                disabled={
                                  eventSaveStatus === 'saving' ||
                                  isGroupSaving ||
                                  isDistanceSaving
                                }
                              >
                                {saveState.status === 'saving'
                                  ? 'Сохраняем...'
                                  : 'Сохранить группу'}
                              </button>

                              {saveState.message && (
                                <p
                                  className={
                                    saveState.status === 'success'
                                      ? 'adminSaveSuccess'
                                      : 'adminAuthMessage'
                                  }
                                  role={
                                    saveState.status === 'error'
                                      ? 'alert'
                                      : 'status'
                                  }
                                >
                                  {saveState.message}
                                </p>
                              )}
                            </div>
                          </form>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section
                  className="adminDistancesSection"
                  aria-labelledby="admin-distances-title"
                >
                  <div className="adminDistancesHeader">
                    <div>
                      <p className="adminPageEyebrow">Параметры забега</p>
                      <h3 id="admin-distances-title">Дистанции</h3>
                    </div>
                    <span>{eventDetail.distances?.length ?? 0}</span>
                  </div>

                  <form
                    className="adminDistanceCard adminDistanceCreateCard"
                    onSubmit={handleCreateDistance}
                  >
                    <div className="adminDistanceCardHeader">
                      <h4>Добавить дистанцию</h4>
                      <span>Новая</span>
                    </div>

                    <div className="adminDistanceFormGrid">
                      <label className="adminEventField adminDistanceFieldWide">
                        <span>Группа</span>
                        <select
                          name="groupId"
                          value={newDistanceForm.groupId}
                          onChange={handleNewDistanceFormChange}
                          required
                        >
                          <option value="">Выберите группу</option>
                          {(eventDetail.groups ?? []).map((group) => (
                            <option value={group.id} key={group.id}>
                              {group.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="adminEventField adminDistanceFieldWide">
                        <span>Название</span>
                        <input
                          name="title"
                          type="text"
                          value={newDistanceForm.title}
                          onChange={handleNewDistanceFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Код</span>
                        <input
                          name="code"
                          type="text"
                          value={newDistanceForm.code}
                          onChange={handleNewDistanceFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Дистанция, м</span>
                        <input
                          name="distanceMeters"
                          type="number"
                          min="1"
                          max="2147483647"
                          step="1"
                          value={newDistanceForm.distanceMeters}
                          onChange={handleNewDistanceFormChange}
                          required
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Минимальный возраст</span>
                        <input
                          name="minAge"
                          type="number"
                          min="0"
                          max="32767"
                          step="1"
                          value={newDistanceForm.minAge}
                          onChange={handleNewDistanceFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Максимальный возраст</span>
                        <input
                          name="maxAge"
                          type="number"
                          min="0"
                          max="32767"
                          step="1"
                          value={newDistanceForm.maxAge}
                          onChange={handleNewDistanceFormChange}
                        />
                      </label>

                      <label className="adminEventField">
                        <span>Лимит участников</span>
                        <input
                          name="capacity"
                          type="number"
                          min="1"
                          max="2147483647"
                          step="1"
                          value={newDistanceForm.capacity}
                          onChange={handleNewDistanceFormChange}
                        />
                        <small>Лимит только этой дистанции.</small>
                      </label>

                      <label className="adminEventField">
                        <span>Цена дистанции</span>
                        <input
                          name="price"
                          type="text"
                          inputMode="decimal"
                          value={newDistanceForm.price}
                          onChange={handleNewDistanceFormChange}
                        />
                        <small>
                          Пусто — базовая цена мероприятия.
                        </small>
                      </label>

                      <label className="adminEventField">
                        <span>Порядок</span>
                        <input
                          name="sortOrder"
                          type="number"
                          min="0"
                          max="32767"
                          step="1"
                          value={newDistanceForm.sortOrder}
                          onChange={handleNewDistanceFormChange}
                          required
                        />
                      </label>
                    </div>

                    <div className="adminEventFormActions">
                      <button
                        className="adminEventSaveButton"
                        type="submit"
                        disabled={
                          eventSaveStatus === 'saving' ||
                          isGroupSaving ||
                          isDistanceSaving ||
                          isNextDistanceSortOrderUnavailable ||
                          (eventDetail.groups?.length ?? 0) === 0
                        }
                      >
                        {newDistanceSaveState.status === 'saving'
                          ? 'Добавляем...'
                          : 'Добавить дистанцию'}
                      </button>

                      {newDistanceSaveState.message && (
                        <p
                          className={
                            newDistanceSaveState.status === 'success'
                              ? 'adminSaveSuccess'
                              : 'adminAuthMessage'
                          }
                          role={
                            newDistanceSaveState.status === 'error'
                              ? 'alert'
                              : 'status'
                          }
                        >
                          {newDistanceSaveState.message}
                        </p>
                      )}
                    </div>

                    {isNextDistanceSortOrderUnavailable && (
                      <p className="adminAuthMessage" role="alert">
                        Нельзя вычислить следующий порядок: достигнут
                        лимит 32767.
                      </p>
                    )}

                    {(eventDetail.groups?.length ?? 0) === 0 && (
                      <p className="adminAuthMessage" role="alert">
                        Сначала добавьте группу регистрации.
                      </p>
                    )}
                  </form>

                  {(eventDetail.distances?.length ?? 0) === 0 && (
                    <p>У мероприятия пока нет дистанций.</p>
                  )}

                  {(eventDetail.distances?.length ?? 0) > 0 && (
                    <div className="adminDistanceCards">
                      {eventDetail.distances.map((distance) => {
                        const form = distanceForms[distance.id]
                        const saveState =
                          distanceSaveStates[distance.id] ?? {
                            status: 'idle',
                            message: '',
                          }

                        if (!form) {
                          return null
                        }

                        return (
                          <form
                            className="adminDistanceCard"
                            key={distance.id}
                            onSubmit={(submitEvent) =>
                              handleSaveDistance(
                                submitEvent,
                                distance.id,
                              )
                            }
                          >
                            <div className="adminDistanceCardHeader">
                              <h4>{form.title || 'Без названия'}</h4>
                              <span>{form.code || 'Без кода'}</span>
                            </div>

                            <div className="adminDistanceFormGrid">
                              <label className="adminEventField adminDistanceFieldWide">
                                <span>Группа</span>
                                <select
                                  name="groupId"
                                  value={form.groupId}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                >
                                  <option value="">
                                    Выберите группу
                                  </option>
                                  {(eventDetail.groups ?? []).map(
                                    (group) => (
                                      <option
                                        value={group.id}
                                        key={group.id}
                                      >
                                        {group.title}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>

                              <label className="adminEventField adminDistanceFieldWide">
                                <span>Название</span>
                                <input
                                  name="title"
                                  type="text"
                                  value={form.title}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Код</span>
                                <input
                                  name="code"
                                  type="text"
                                  value={form.code}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Дистанция, м</span>
                                <input
                                  name="distanceMeters"
                                  type="number"
                                  min="1"
                                  max="2147483647"
                                  step="1"
                                  value={form.distanceMeters}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Минимальный возраст</span>
                                <input
                                  name="minAge"
                                  type="number"
                                  min="0"
                                  max="32767"
                                  step="1"
                                  value={form.minAge}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Максимальный возраст</span>
                                <input
                                  name="maxAge"
                                  type="number"
                                  min="0"
                                  max="32767"
                                  step="1"
                                  value={form.maxAge}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                />
                              </label>

                              <label className="adminEventField">
                                <span>Лимит участников</span>
                                <input
                                  name="capacity"
                                  type="number"
                                  min="1"
                                  max="2147483647"
                                  step="1"
                                  value={form.capacity}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                />
                                <small>
                                  Лимит только этой дистанции.
                                </small>
                              </label>

                              <label className="adminEventField">
                                <span>Цена дистанции</span>
                                <input
                                  name="price"
                                  type="text"
                                  inputMode="decimal"
                                  value={form.price}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                />
                                <small>
                                  Пусто — базовая цена мероприятия.
                                </small>
                              </label>

                              <label className="adminEventField">
                                <span>Порядок</span>
                                <input
                                  name="sortOrder"
                                  type="number"
                                  min="0"
                                  max="32767"
                                  step="1"
                                  value={form.sortOrder}
                                  onChange={(changeEvent) =>
                                    handleDistanceFormChange(
                                      distance.id,
                                      changeEvent,
                                    )
                                  }
                                  required
                                />
                              </label>
                            </div>

                            <div className="adminEventFormActions">
                              <button
                                className="adminEventSaveButton"
                                type="submit"
                                disabled={
                                  eventSaveStatus === 'saving' ||
                                  isGroupSaving ||
                                  isDistanceSaving
                                }
                              >
                                {saveState.status === 'saving'
                                  ? 'Сохраняем...'
                                  : 'Сохранить дистанцию'}
                              </button>

                              {saveState.message && (
                                <p
                                  className={
                                    saveState.status === 'success'
                                      ? 'adminSaveSuccess'
                                      : 'adminAuthMessage'
                                  }
                                  role={
                                    saveState.status === 'error'
                                      ? 'alert'
                                      : 'status'
                                  }
                                >
                                  {saveState.message}
                                </p>
                              )}
                            </div>
                          </form>
                        )
                      })}
                    </div>
                  )}
                </section>
                </>
              )}
            </section>
          )}

          <section className="adminPageSection">
            <h2>Регистрации</h2>
            <p>
              Просмотр участников, статусов оплаты и документов.
            </p>
          </section>

          <section className="adminPageSection">
            <h2>Настройки регистрации</h2>
            <p>
              Детская или взрослая форма, возрастные ограничения,
              документы и обязательные согласия.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default AdminPage
