import { useEffect, useState } from 'react'
import {
  AdminAuthError,
  getAdminEvent,
  getAdminEvents,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  updateAdminEvent,
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
]

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

    try {
      const result = await getAdminEvent(eventId)

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail(result)
      setEventForm(createEventForm(result.event))
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
        setSessionStatus('unauthenticated')
        return
      }

      setEventDetail(null)
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
        setSessionStatus('unauthenticated')
        return
      }

      setEventSaveStatus('error')
      setEventSaveMessage(
        error instanceof AdminAuthError && error.status === 404
          ? 'Мероприятие не найдено.'
          : 'Не удалось сохранить. Проверьте данные и попробуйте ещё раз.',
      )
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
      setSessionStatus('unauthenticated')
    } catch {
      setLogoutStatus('idle')
      setLogoutMessage('Не удалось выйти. Попробуйте ещё раз.')
    }
  }

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
                    disabled={eventSaveStatus === 'saving'}
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
                <form
                  className="adminEventForm"
                  onSubmit={handleSaveEvent}
                >
                  <div className="adminEventCounts">
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
                      disabled={eventSaveStatus === 'saving'}
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
