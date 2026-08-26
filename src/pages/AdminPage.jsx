import { useCallback, useEffect, useState } from 'react'
import {
  AdminAuthError,
  createAdminConsentRequirement,
  createAdminDistance,
  createAdminDocumentRequirement,
  createAdminEvent,
  createAdminGroup,
  deleteAdminEvent,
  getAdminEvent,
  getAdminEvents,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  updateAdminDistance,
  updateAdminConsentRequirement,
  updateAdminDocumentRequirement,
  updateAdminEvent,
  updateAdminEventPublication,
  updateAdminGroup,
} from '../api/admin'
import AdminEventManagement from '../components/AdminEventManagement'
import AdminStarterKit from '../components/AdminStarterKit'
import { getEventReadiness } from '../../shared/event-readiness'
import './AdminPage.css'

const WORKSPACE_MODULES = [
  {
    id: 'main',
    title: 'Основное',
    description: 'Карточка, статус, описание, место и дата.',
  },
  {
    id: 'registration',
    title: 'Регистрация',
    description: 'Настройки, документы и обязательные согласия.',
  },
  {
    id: 'distances',
    title: 'Дистанции',
    description: 'Группы регистрации, дистанции, лимиты и цены.',
  },
  {
    id: 'kit',
    title: 'Стартовый набор',
    description: 'Выбор предметов из общей библиотеки.',
  },
  {
    id: 'partners',
    title: 'Партнёры',
    description: 'Партнёры, категории, сайты и логотипы события.',
  },
  {
    id: 'participants',
    title: 'Участники',
    description: 'Регистрации, контакты, документы и платежи.',
  },
]

const EVENT_STATUS_OPTIONS = [
  ['draft', 'Черновик'],
  ['coming_soon', 'Скоро'],
  ['open', 'Открыта'],
  ['sold_out', 'Мест нет'],
  ['closed', 'Закрыта'],
  ['finished', 'Завершено'],
]

const EVENT_STATUS_LABELS = Object.fromEntries(
  EVENT_STATUS_OPTIONS,
)
const READINESS_REASON_LABELS = {
  incomplete_public_details: 'Заполните основные данные мероприятия.',
  invalid_registration_form_type: 'Выберите тип формы регистрации.',
  date_not_confirmed: 'Подтвердите дату и время мероприятия.',
  no_registration_groups: 'Добавьте хотя бы одну группу регистрации.',
  registration_form_mismatch: 'Проверьте тип группы регистрации.',
  no_distances: 'Добавьте хотя бы одну дистанцию.',
  invalid_distance_group: 'Привяжите каждую дистанцию к подходящей группе.',
  invalid_distance: 'Проверьте параметры дистанций.',
  invalid_price: 'Укажите корректную цену события или дистанции.',
  invalid_capacity: 'Проверьте лимиты участников.',
  invalid_currency: 'Укажите корректную валюту.',
}

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

function getNextRequirementSortOrder(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return 0
  }

  const highestSortOrder = Math.max(
    ...requirements.map((requirement) => requirement.sortOrder),
  )

  return highestSortOrder >= 32767 ? null : highestSortOrder + 1
}

function createDocumentForm(document) {
  return {
    title: document.title ?? '',
    documentType: document.documentType ?? '',
    description: document.description ?? '',
    templateUrl: document.templateUrl ?? '',
    required: document.required ?? true,
    sortOrder: String(document.sortOrder ?? 0),
  }
}

function createDocumentForms(documents) {
  return Object.fromEntries(
    (Array.isArray(documents) ? documents : []).map((document) => [
      document.id,
      createDocumentForm(document),
    ]),
  )
}

function createNewDocumentForm(documents) {
  const nextSortOrder = getNextRequirementSortOrder(documents)

  return {
    title: '',
    documentType: '',
    description: '',
    templateUrl: '',
    required: true,
    sortOrder: nextSortOrder === null ? '' : String(nextSortOrder),
  }
}

function buildDocumentChanges(form) {
  const title = form.title.trim()
  const documentType = form.documentType.trim()

  if (!title || !documentType) {
    throw new EventFormError(
      'Название и тип документа не должны быть пустыми.',
    )
  }

  return {
    title,
    documentType,
    description: form.description.trim() || null,
    templateUrl: form.templateUrl.trim() || null,
    required: form.required,
    sortOrder: integerInputToValue(form.sortOrder, {
      label: 'Порядок',
      max: 32767,
    }),
  }
}

function createConsentForm(consent) {
  return {
    title: consent.title ?? '',
    consentType: consent.consentType ?? '',
    consentVersion: consent.consentVersion ?? '1',
    bodyText: consent.bodyText ?? '',
    documentUrl: consent.documentUrl ?? '',
    required: consent.required ?? true,
    sortOrder: String(consent.sortOrder ?? 0),
  }
}

function createConsentForms(consents) {
  return Object.fromEntries(
    (Array.isArray(consents) ? consents : []).map((consent) => [
      consent.id,
      createConsentForm(consent),
    ]),
  )
}

function createNewConsentForm(consents) {
  const nextSortOrder = getNextRequirementSortOrder(consents)

  return {
    title: '',
    consentType: '',
    consentVersion: '1',
    bodyText: '',
    documentUrl: '',
    required: true,
    sortOrder: nextSortOrder === null ? '' : String(nextSortOrder),
  }
}

function buildConsentChanges(form) {
  const title = form.title.trim()
  const consentType = form.consentType.trim()
  const consentVersion = form.consentVersion.trim()
  const bodyText = form.bodyText.trim()

  if (!title || !consentType || !consentVersion || !bodyText) {
    throw new EventFormError(
      'Название, тип, версия и текст согласия обязательны.',
    )
  }

  return {
    title,
    consentType,
    consentVersion,
    bodyText,
    documentUrl: form.documentUrl.trim() || null,
    required: form.required,
    sortOrder: integerInputToValue(form.sortOrder, {
      label: 'Порядок',
      max: 32767,
    }),
  }
}

function getRequirementErrorMessage(error, resource, operation) {
  const isDocument = resource === 'document'

  if (error instanceof AdminAuthError) {
    if (
      error.code === 'document_type_conflict' ||
      error.code === 'consent_type_conflict'
    ) {
      return isDocument
        ? 'Документ с таким типом уже существует.'
        : 'Согласие с таким типом уже существует.'
    }

    if (error.code === 'event_not_found') {
      return 'Мероприятие не найдено.'
    }

    if (error.code === 'requirement_not_found') {
      return isDocument
        ? 'Документ не найден.'
        : 'Согласие не найдено.'
    }

    if (error.status === 400) {
      return 'Проверьте заполненные данные.'
    }
  }

  if (operation === 'create') {
    return isDocument
      ? 'Не удалось добавить документ.'
      : 'Не удалось добавить согласие.'
  }

  return isDocument
    ? 'Не удалось сохранить документ.'
    : 'Не удалось сохранить согласие.'
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

function createNewEventForm() {
  return {
    title: '',
    slug: '',
    eventType: '',
    registrationFormType: 'participant',
    city: '',
    capacity: '',
    shortDescription: '',
    description: '',
  }
}

function buildNewEventChanges(form) {
  const slug = form.slug.trim()

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new EventFormError(
      'Slug: используйте строчные латинские буквы, цифры и одиночные дефисы.',
    )
  }

  const requiredTextFields = [
    form.title,
    form.eventType,
    form.shortDescription,
    form.description,
    form.city,
  ]

  if (requiredTextFields.some((value) => !value.trim())) {
    throw new EventFormError('Заполните все обязательные поля.')
  }

  if (
    !['kids', 'participant', 'mixed'].includes(
      form.registrationFormType,
    )
  ) {
    throw new EventFormError('Выберите форму регистрации.')
  }

  return {
    slug,
    title: form.title.trim(),
    eventType: form.eventType.trim(),
    registrationFormType: form.registrationFormType,
    shortDescription: form.shortDescription.trim(),
    description: form.description.trim(),
    city: form.city.trim(),
    capacity: integerInputToValue(form.capacity, {
      label: 'Лимит участников',
      min: 1,
      max: 2147483647,
    }),
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
    isPublished: updatedEvent.isPublished,
    publishedAt: updatedEvent.publishedAt,
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

function DocumentRequirementFields({ form, onChange }) {
  return (
    <div className="adminRequirementFormGrid">
      <label className="adminEventField">
        <span>Название</span>
        <input
          name="title"
          type="text"
          value={form.title}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminEventField">
        <span>Тип документа</span>
        <input
          name="documentType"
          type="text"
          value={form.documentType}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminEventField adminRequirementFieldWide">
        <span>Описание</span>
        <textarea
          name="description"
          rows="3"
          value={form.description}
          onChange={onChange}
        />
      </label>

      <label className="adminEventField adminRequirementFieldWide">
        <span>Ссылка на шаблон</span>
        <input
          name="templateUrl"
          type="url"
          value={form.templateUrl}
          onChange={onChange}
        />
      </label>

      <label className="adminRequirementCheckbox">
        <input
          name="required"
          type="checkbox"
          checked={form.required}
          onChange={onChange}
        />
        <span>Обязательный документ</span>
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
          onChange={onChange}
          required
        />
      </label>
    </div>
  )
}

function ConsentRequirementFields({ form, onChange }) {
  return (
    <div className="adminRequirementFormGrid">
      <label className="adminEventField">
        <span>Название</span>
        <input
          name="title"
          type="text"
          value={form.title}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminEventField">
        <span>Тип согласия</span>
        <input
          name="consentType"
          type="text"
          value={form.consentType}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminEventField">
        <span>Версия</span>
        <input
          name="consentVersion"
          type="text"
          value={form.consentVersion}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminEventField adminRequirementFieldWide">
        <span>Ссылка на документ</span>
        <input
          name="documentUrl"
          type="url"
          value={form.documentUrl}
          onChange={onChange}
        />
      </label>

      <label className="adminEventField adminRequirementFieldWide">
        <span>Текст согласия</span>
        <textarea
          name="bodyText"
          rows="5"
          value={form.bodyText}
          onChange={onChange}
          required
        />
      </label>

      <label className="adminRequirementCheckbox">
        <input
          name="required"
          type="checkbox"
          checked={form.required}
          onChange={onChange}
        />
        <span>Обязательное согласие</span>
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
          onChange={onChange}
          required
        />
      </label>
    </div>
  )
}

function RequirementSaveMessage({ state }) {
  if (!state.message) {
    return null
  }

  return (
    <p
      className={
        state.status === 'success'
          ? 'adminSaveSuccess'
          : 'adminAuthMessage'
      }
      role={state.status === 'error' ? 'alert' : 'status'}
    >
      {state.message}
    </p>
  )
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
  const [isNewEventOpen, setIsNewEventOpen] = useState(false)
  const [newEventForm, setNewEventForm] = useState(createNewEventForm)
  const [newEventSaveState, setNewEventSaveState] = useState({
    status: 'idle',
    message: '',
  })
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [eventDetailStatus, setEventDetailStatus] = useState('idle')
  const [eventDetail, setEventDetail] = useState(null)
  const [eventDetailMessage, setEventDetailMessage] = useState('')
  const [workspaceModule, setWorkspaceModule] = useState(null)
  const [registrationTab, setRegistrationTab] = useState('settings')
  const [eventForm, setEventForm] = useState(null)
  const [eventSaveStatus, setEventSaveStatus] = useState('idle')
  const [eventSaveMessage, setEventSaveMessage] = useState('')
  const [eventDeleteState, setEventDeleteState] = useState({
    confirming: false,
    status: 'idle',
    message: '',
  })
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
  const [documentForms, setDocumentForms] = useState({})
  const [documentSaveStates, setDocumentSaveStates] = useState({})
  const [newDocumentForm, setNewDocumentForm] = useState(() =>
    createNewDocumentForm([]),
  )
  const [newDocumentSaveState, setNewDocumentSaveState] = useState({
    status: 'idle',
    message: '',
  })
  const [consentForms, setConsentForms] = useState({})
  const [consentSaveStates, setConsentSaveStates] = useState({})
  const [newConsentForm, setNewConsentForm] = useState(() =>
    createNewConsentForm([]),
  )
  const [newConsentSaveState, setNewConsentSaveState] = useState({
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

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      return
    }

    setIsNewEventOpen(false)
    setNewEventForm(createNewEventForm())
    setNewEventSaveState({ status: 'idle', message: '' })
    setEventDeleteState({
      confirming: false,
      status: 'idle',
      message: '',
    })
  }, [sessionStatus])

  const handleNewEventFormChange = (changeEvent) => {
    const { name, value } = changeEvent.target

    setNewEventForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
    setNewEventSaveState({ status: 'idle', message: '' })
  }

  const handleCreateEvent = async (submitEvent) => {
    submitEvent.preventDefault()

    let changes

    try {
      changes = buildNewEventChanges(newEventForm)
    } catch (error) {
      setNewEventSaveState({
        status: 'error',
        message:
          error instanceof EventFormError
            ? error.message
            : 'Проверьте заполненные данные.',
      })
      return
    }

    setNewEventSaveState({ status: 'saving', message: '' })

    try {
      const result = await createAdminEvent(changes)

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      const createdDetail = {
        event: result.event,
        groups: [],
        distances: [],
        documents: [],
        consents: [],
        kitItems: [],
        partners: [],
      }

      setEvents((currentEvents) => [
        result.event,
        ...currentEvents.filter((event) => event.id !== result.event.id),
      ])
      setEventsStatus('ready')
      setEventsMessage('')
      setSelectedEventId(result.event.id)
      setWorkspaceModule(null)
      setRegistrationTab('settings')
      setEventDetail(createdDetail)
      setEventDetailStatus('ready')
      setEventDetailMessage('Мероприятие создано как черновик.')
      setEventForm(createEventForm(result.event))
      setEventSaveStatus('idle')
      setEventSaveMessage('')
      setEventDeleteState({
        confirming: false,
        status: 'idle',
        message: '',
      })
      setGroupForms({})
      setGroupSaveStates({})
      setNewGroupForm(
        createNewGroupForm([], result.event.registrationFormType),
      )
      setNewGroupSaveState({ status: 'idle', message: '' })
      setDistanceForms({})
      setDistanceSaveStates({})
      setNewDistanceForm(createNewDistanceForm([]))
      setNewDistanceSaveState({ status: 'idle', message: '' })
      setDocumentForms({})
      setDocumentSaveStates({})
      setNewDocumentForm(createNewDocumentForm([]))
      setNewDocumentSaveState({ status: 'idle', message: '' })
      setConsentForms({})
      setConsentSaveStates({})
      setNewConsentForm(createNewConsentForm([]))
      setNewConsentSaveState({ status: 'idle', message: '' })
      setNewEventForm(createNewEventForm())
      setNewEventSaveState({ status: 'idle', message: '' })
      setIsNewEventOpen(false)
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setEventsStatus('idle')
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось создать мероприятие. Попробуйте ещё раз.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'event_slug_conflict'
      ) {
        message = 'Мероприятие с таким slug уже существует.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 400
      ) {
        message = 'Проверьте обязательные поля и формат данных.'
      }

      setNewEventSaveState({ status: 'error', message })
    }
  }

  const handleSelectEvent = async (eventId) => {
    setSelectedEventId(eventId)
    setWorkspaceModule(null)
    setRegistrationTab('settings')
    setEventDetailStatus('loading')
    setEventDetail(null)
    setEventDetailMessage('')
    setEventForm(null)
    setEventSaveStatus('idle')
    setEventSaveMessage('')
    setEventDeleteState({
      confirming: false,
      status: 'idle',
      message: '',
    })
    setGroupForms({})
    setGroupSaveStates({})
    setNewGroupForm(createNewGroupForm([], 'participant'))
    setNewGroupSaveState({ status: 'idle', message: '' })
    setDistanceForms({})
    setDistanceSaveStates({})
    setNewDistanceForm(createNewDistanceForm([]))
    setNewDistanceSaveState({ status: 'idle', message: '' })
    setDocumentForms({})
    setDocumentSaveStates({})
    setNewDocumentForm(createNewDocumentForm([]))
    setNewDocumentSaveState({ status: 'idle', message: '' })
    setConsentForms({})
    setConsentSaveStates({})
    setNewConsentForm(createNewConsentForm([]))
    setNewConsentSaveState({ status: 'idle', message: '' })

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
      setDocumentForms(createDocumentForms(result.documents))
      setNewDocumentForm(createNewDocumentForm(result.documents))
      setConsentForms(createConsentForms(result.consents))
      setNewConsentForm(createNewConsentForm(result.consents))
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
      setDocumentForms({})
      setNewDocumentForm(createNewDocumentForm([]))
      setConsentForms({})
      setNewConsentForm(createNewConsentForm([]))
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
    setEventDetailMessage('')
  }

  const handleSaveEvent = async (submitEvent) => {
    submitEvent?.preventDefault()

    if (!eventDetail?.event || !eventForm) {
      return null
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
      return null
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
      setEventSaveMessage(
        result.event.isPublished
          ? 'Изменения сохранены'
          : 'Черновик сохранён',
      )
      return result.event
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
        return null
      }

      setEventSaveStatus('error')
      setEventSaveMessage(
        error instanceof AdminAuthError &&
          error.code === 'incompatible_registration_groups'
          ? 'Сначала измените тип несовместимых групп регистрации.'
          : error instanceof AdminAuthError &&
              error.code === 'registration_not_ready'
            ? READINESS_REASON_LABELS[error.details?.reasons?.[0]] ??
              'Регистрация ещё не настроена.'
            : error instanceof AdminAuthError && error.status === 404
              ? 'Мероприятие не найдено.'
              : 'Не удалось сохранить. Проверьте данные и попробуйте ещё раз.',
      )
      return null
    }
  }

  const handlePublicationChange = async (action) => {
    if (!eventDetail?.event || eventSaveStatus === 'saving') {
      return
    }

    if (action === 'publish') {
      const savedEvent = await handleSaveEvent()

      if (!savedEvent) {
        return
      }
    }

    setEventSaveStatus('saving')
    setEventSaveMessage('')

    try {
      const result = await updateAdminEventPublication(
        eventDetail.event.id,
        action,
      )

      if (!result.event || typeof result.event !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        event: result.event,
      }))
      if (action === 'publish') {
        setEventForm(createEventForm(result.event))
      }
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === result.event.id
            ? updateEventListItem(event, result.event)
            : event,
        ),
      )
      setEventSaveStatus('success')
      setEventSaveMessage(
        action === 'publish'
          ? 'Мероприятие размещено на сайте'
          : 'Мероприятие снято с публикации',
      )
      setEventDeleteState({
        confirming: false,
        status: 'idle',
        message: '',
      })
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
          : 'Не удалось изменить публикацию. Попробуйте ещё раз.',
      )
    }
  }

  const handleDeleteEvent = async () => {
    if (
      !eventDetail?.event ||
      eventDetail.event.isPublished ||
      eventDeleteState.status === 'deleting'
    ) {
      return
    }

    setEventDeleteState({
      confirming: true,
      status: 'deleting',
      message: '',
    })

    try {
      const result = await deleteAdminEvent(eventDetail.event.id)

      if (result.deleted !== true) {
        throw new AdminAuthError('invalid_server_response')
      }

      const refreshed = await getAdminEvents()

      if (!Array.isArray(refreshed.events)) {
        throw new AdminAuthError('invalid_server_response')
      }

      setEvents(refreshed.events)
      setEventsStatus('ready')
      setEventsMessage('')
      setSelectedEventId(null)
      setWorkspaceModule(null)
      setEventDetail(null)
      setEventDetailStatus('idle')
      setEventDetailMessage('')
      setEventForm(null)
      setEventSaveStatus('idle')
      setEventSaveMessage('')
      setEventDeleteState({
        confirming: false,
        status: 'idle',
        message: '',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        setEvents([])
        setEventsStatus('idle')
        setSelectedEventId(null)
        setEventDetail(null)
        setEventDetailStatus('idle')
        setEventForm(null)
        setSessionStatus('unauthenticated')
        return
      }

      let message = 'Не удалось удалить мероприятие. Попробуйте ещё раз.'

      if (
        error instanceof AdminAuthError &&
        error.code === 'event_has_registrations'
      ) {
        message = 'Удалить мероприятие нельзя: у него уже есть регистрации.'
      } else if (
        error instanceof AdminAuthError &&
        error.code === 'event_is_published'
      ) {
        message = 'Сначала снимите мероприятие с публикации.'
      } else if (
        error instanceof AdminAuthError &&
        error.status === 404
      ) {
        message = 'Мероприятие не найдено.'
      }

      setEventDeleteState({
        confirming: true,
        status: 'error',
        message,
      })
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

  const resetAfterRequirementUnauthorized = () => {
    setEvents([])
    setSelectedEventId(null)
    setEventDetail(null)
    setEventDetailStatus('idle')
    setEventForm(null)
    setDocumentForms({})
    setDocumentSaveStates({})
    setNewDocumentForm(createNewDocumentForm([]))
    setNewDocumentSaveState({ status: 'idle', message: '' })
    setConsentForms({})
    setConsentSaveStates({})
    setNewConsentForm(createNewConsentForm([]))
    setNewConsentSaveState({ status: 'idle', message: '' })
    setSessionStatus('unauthenticated')
  }

  const handleDocumentFormChange = (documentId, changeEvent) => {
    const { name, value, checked, type } = changeEvent.target

    setDocumentForms((currentForms) => ({
      ...currentForms,
      [documentId]: {
        ...currentForms[documentId],
        [name]: type === 'checkbox' ? checked : value,
      },
    }))
    setDocumentSaveStates((currentStates) => ({
      ...currentStates,
      [documentId]: { status: 'idle', message: '' },
    }))
  }

  const handleNewDocumentFormChange = (changeEvent) => {
    const { name, value, checked, type } = changeEvent.target

    setNewDocumentForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setNewDocumentSaveState({ status: 'idle', message: '' })
  }

  const handleSaveDocument = async (submitEvent, documentId) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const form = documentForms[documentId]

    if (!eventId || !form) {
      return
    }

    let changes

    try {
      changes = buildDocumentChanges(form)
    } catch (error) {
      setDocumentSaveStates((currentStates) => ({
        ...currentStates,
        [documentId]: {
          status: 'error',
          message:
            error instanceof EventFormError
              ? error.message
              : 'Проверьте заполненные данные.',
        },
      }))
      return
    }

    setDocumentSaveStates((currentStates) => ({
      ...currentStates,
      [documentId]: { status: 'saving', message: '' },
    }))

    try {
      const result = await updateAdminDocumentRequirement(
        eventId,
        documentId,
        changes,
      )

      if (!result.document || typeof result.document !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        documents: (currentDetail?.documents ?? []).map((document) =>
          document.id === result.document.id
            ? result.document
            : document,
        ),
      }))
      setDocumentForms((currentForms) => ({
        ...currentForms,
        [documentId]: createDocumentForm(result.document),
      }))
      setDocumentSaveStates((currentStates) => ({
        ...currentStates,
        [documentId]: { status: 'success', message: 'Сохранено' },
      }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        resetAfterRequirementUnauthorized()
        return
      }

      setDocumentSaveStates((currentStates) => ({
        ...currentStates,
        [documentId]: {
          status: 'error',
          message: getRequirementErrorMessage(
            error,
            'document',
            'update',
          ),
        },
      }))
    }
  }

  const handleCreateDocument = async (submitEvent) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const currentDocuments = eventDetail?.documents ?? []

    if (!eventId) {
      return
    }

    if (getNextRequirementSortOrder(currentDocuments) === null) {
      setNewDocumentSaveState({
        status: 'error',
        message: 'Нельзя вычислить следующий порядок: достигнут лимит 32767.',
      })
      return
    }

    let changes

    try {
      changes = buildDocumentChanges(newDocumentForm)
    } catch (error) {
      setNewDocumentSaveState({
        status: 'error',
        message:
          error instanceof EventFormError
            ? error.message
            : 'Проверьте заполненные данные.',
      })
      return
    }

    setNewDocumentSaveState({ status: 'saving', message: '' })

    try {
      const result = await createAdminDocumentRequirement(eventId, changes)

      if (!result.document || typeof result.document !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      const updatedDocuments = [...currentDocuments, result.document]

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        documents: [
          ...(currentDetail?.documents ?? []),
          result.document,
        ],
      }))
      setDocumentForms((currentForms) => ({
        ...currentForms,
        [result.document.id]: createDocumentForm(result.document),
      }))
      setNewDocumentForm(createNewDocumentForm(updatedDocuments))
      setNewDocumentSaveState({
        status: 'success',
        message: 'Документ добавлен',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        resetAfterRequirementUnauthorized()
        return
      }

      setNewDocumentSaveState({
        status: 'error',
        message: getRequirementErrorMessage(
          error,
          'document',
          'create',
        ),
      })
    }
  }

  const handleConsentFormChange = (consentId, changeEvent) => {
    const { name, value, checked, type } = changeEvent.target

    setConsentForms((currentForms) => ({
      ...currentForms,
      [consentId]: {
        ...currentForms[consentId],
        [name]: type === 'checkbox' ? checked : value,
      },
    }))
    setConsentSaveStates((currentStates) => ({
      ...currentStates,
      [consentId]: { status: 'idle', message: '' },
    }))
  }

  const handleNewConsentFormChange = (changeEvent) => {
    const { name, value, checked, type } = changeEvent.target

    setNewConsentForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setNewConsentSaveState({ status: 'idle', message: '' })
  }

  const handleSaveConsent = async (submitEvent, consentId) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const form = consentForms[consentId]

    if (!eventId || !form) {
      return
    }

    let changes

    try {
      changes = buildConsentChanges(form)
    } catch (error) {
      setConsentSaveStates((currentStates) => ({
        ...currentStates,
        [consentId]: {
          status: 'error',
          message:
            error instanceof EventFormError
              ? error.message
              : 'Проверьте заполненные данные.',
        },
      }))
      return
    }

    setConsentSaveStates((currentStates) => ({
      ...currentStates,
      [consentId]: { status: 'saving', message: '' },
    }))

    try {
      const result = await updateAdminConsentRequirement(
        eventId,
        consentId,
        changes,
      )

      if (!result.consent || typeof result.consent !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        consents: (currentDetail?.consents ?? []).map((consent) =>
          consent.id === result.consent.id
            ? result.consent
            : consent,
        ),
      }))
      setConsentForms((currentForms) => ({
        ...currentForms,
        [consentId]: createConsentForm(result.consent),
      }))
      setConsentSaveStates((currentStates) => ({
        ...currentStates,
        [consentId]: { status: 'success', message: 'Сохранено' },
      }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        resetAfterRequirementUnauthorized()
        return
      }

      setConsentSaveStates((currentStates) => ({
        ...currentStates,
        [consentId]: {
          status: 'error',
          message: getRequirementErrorMessage(
            error,
            'consent',
            'update',
          ),
        },
      }))
    }
  }

  const handleCreateConsent = async (submitEvent) => {
    submitEvent.preventDefault()

    const eventId = eventDetail?.event?.id
    const currentConsents = eventDetail?.consents ?? []

    if (!eventId) {
      return
    }

    if (getNextRequirementSortOrder(currentConsents) === null) {
      setNewConsentSaveState({
        status: 'error',
        message: 'Нельзя вычислить следующий порядок: достигнут лимит 32767.',
      })
      return
    }

    let changes

    try {
      changes = buildConsentChanges(newConsentForm)
    } catch (error) {
      setNewConsentSaveState({
        status: 'error',
        message:
          error instanceof EventFormError
            ? error.message
            : 'Проверьте заполненные данные.',
      })
      return
    }

    setNewConsentSaveState({ status: 'saving', message: '' })

    try {
      const result = await createAdminConsentRequirement(eventId, changes)

      if (!result.consent || typeof result.consent !== 'object') {
        throw new AdminAuthError('invalid_server_response')
      }

      const updatedConsents = [...currentConsents, result.consent]

      setEventDetail((currentDetail) => ({
        ...currentDetail,
        consents: [
          ...(currentDetail?.consents ?? []),
          result.consent,
        ],
      }))
      setConsentForms((currentForms) => ({
        ...currentForms,
        [result.consent.id]: createConsentForm(result.consent),
      }))
      setNewConsentForm(createNewConsentForm(updatedConsents))
      setNewConsentSaveState({
        status: 'success',
        message: 'Согласие добавлено',
      })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        resetAfterRequirementUnauthorized()
        return
      }

      setNewConsentSaveState({
        status: 'error',
        message: getRequirementErrorMessage(
          error,
          'consent',
          'create',
        ),
      })
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
      setWorkspaceModule(null)
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
      setDocumentForms({})
      setDocumentSaveStates({})
      setNewDocumentForm(createNewDocumentForm([]))
      setNewDocumentSaveState({ status: 'idle', message: '' })
      setConsentForms({})
      setConsentSaveStates({})
      setNewConsentForm(createNewConsentForm([]))
      setNewConsentSaveState({ status: 'idle', message: '' })
      setSessionStatus('unauthenticated')
    } catch {
      setLogoutStatus('idle')
      setLogoutMessage('Не удалось выйти. Попробуйте ещё раз.')
    }
  }

  const handleAdminUnauthorized = useCallback(() => {
    setSessionStatus('unauthenticated')
  }, [])

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
  const isDocumentSaving =
    newDocumentSaveState.status === 'saving' ||
    Object.values(documentSaveStates).some(
      ({ status }) => status === 'saving',
    )
  const isConsentSaving =
    newConsentSaveState.status === 'saving' ||
    Object.values(consentSaveStates).some(
      ({ status }) => status === 'saving',
    )
  const isRequirementSaving = isDocumentSaving || isConsentSaving
  const isNextGroupSortOrderUnavailable =
    eventDetail !== null &&
    getNextGroupSortOrder(eventDetail.groups) === null
  const isNextDistanceSortOrderUnavailable =
    eventDetail !== null &&
    getNextDistanceSortOrder(eventDetail.distances) === null
  const isNextDocumentSortOrderUnavailable =
    eventDetail !== null &&
    getNextRequirementSortOrder(eventDetail.documents) === null
  const isNextConsentSortOrderUnavailable =
    eventDetail !== null &&
    getNextRequirementSortOrder(eventDetail.consents) === null
  const eventReadiness = eventDetail?.event
    ? getEventReadiness({
        event: eventDetail.event,
        groups: eventDetail.groups ?? [],
        distances: eventDetail.distances ?? [],
        documents: eventDetail.documents ?? [],
        consents: eventDetail.consents ?? [],
      })
    : null

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
            <div className="adminEventsHeader">
              <h2>Мероприятия</h2>
              <button
                className="adminCreateEventToggle"
                type="button"
                onClick={() => {
                  setIsNewEventOpen((isOpen) => !isOpen)
                  setNewEventSaveState({ status: 'idle', message: '' })
                }}
                disabled={newEventSaveState.status === 'saving'}
                aria-expanded={isNewEventOpen}
              >
                {isNewEventOpen ? 'Закрыть' : 'Создать мероприятие'}
              </button>
            </div>

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
                      newEventSaveState.status === 'saving' ||
                      eventSaveStatus === 'saving' ||
                      isGroupSaving ||
                      isDistanceSaving
                    }
                  >
                    <strong>{event.title}</strong>
                    <span>{event.city}</span>
                    <span>
                      {event.isPublished ? 'Опубликовано' : 'Черновик'}
                      {' · '}
                      {EVENT_STATUS_LABELS[event.status] ?? event.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {isNewEventOpen && (
            <section className="adminPageSection adminEventCreateSection">
              <p className="adminPageEyebrow">Новое мероприятие</p>
              <h2>Создать черновик</h2>
              <p className="adminSectionHint">
                Новое мероприятие создаётся как черновик. Остальные
                параметры, группы и дистанции настраиваются после
                создания.
              </p>

              <form
                className="adminEventForm adminEventCreateForm"
                onSubmit={handleCreateEvent}
                noValidate
              >
                <div className="adminEventFormGrid">
                  <label className="adminEventField">
                    <span>Название</span>
                    <input
                      name="title"
                      type="text"
                      value={newEventForm.title}
                      onChange={handleNewEventFormChange}
                      required
                    />
                  </label>

                  <label className="adminEventField">
                    <span>Slug</span>
                    <input
                      name="slug"
                      type="text"
                      value={newEventForm.slug}
                      onChange={handleNewEventFormChange}
                      placeholder="karaganda-half-marathon-2026"
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      required
                    />
                  </label>

                  <label className="adminEventField">
                    <span>Тип мероприятия</span>
                    <input
                      name="eventType"
                      type="text"
                      value={newEventForm.eventType}
                      onChange={handleNewEventFormChange}
                      placeholder="road_race"
                      required
                    />
                  </label>

                  <label className="adminEventField">
                    <span>Форма регистрации</span>
                    <select
                      name="registrationFormType"
                      value={newEventForm.registrationFormType}
                      onChange={handleNewEventFormChange}
                      required
                    >
                      {REGISTRATION_FORM_OPTIONS.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="adminEventField">
                    <span>Город</span>
                    <input
                      name="city"
                      type="text"
                      value={newEventForm.city}
                      onChange={handleNewEventFormChange}
                      required
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
                      value={newEventForm.capacity}
                      onChange={handleNewEventFormChange}
                      required
                    />
                  </label>

                  <label className="adminEventField adminEventFieldWide">
                    <span>Краткое описание</span>
                    <textarea
                      name="shortDescription"
                      rows="3"
                      value={newEventForm.shortDescription}
                      onChange={handleNewEventFormChange}
                      required
                    />
                  </label>

                  <label className="adminEventField adminEventFieldWide">
                    <span>Полное описание</span>
                    <textarea
                      name="description"
                      rows="5"
                      value={newEventForm.description}
                      onChange={handleNewEventFormChange}
                      required
                    />
                  </label>
                </div>

                <div className="adminEventFormActions">
                  <button
                    className="adminEventSaveButton"
                    type="submit"
                    disabled={newEventSaveState.status === 'saving'}
                  >
                    {newEventSaveState.status === 'saving'
                      ? 'Создаём...'
                      : 'Создать черновик'}
                  </button>
                  <button
                    className="adminEventCancelButton"
                    type="button"
                    onClick={() => {
                      setIsNewEventOpen(false)
                      setNewEventSaveState({ status: 'idle', message: '' })
                    }}
                    disabled={newEventSaveState.status === 'saving'}
                  >
                    Отмена
                  </button>

                  {newEventSaveState.message && (
                    <p className="adminAuthMessage" role="alert">
                      {newEventSaveState.message}
                    </p>
                  )}
                </div>
              </form>
            </section>
          )}

          {selectedEventId && (
            <section className="adminPageSection adminEventDetailSection">
              <div className="adminWorkspaceHeader">
                <div>
                  <p className="adminPageEyebrow">Мероприятие</p>
                  <h2>{eventDetail?.event?.title ?? 'Рабочая область'}</h2>
                  {eventDetail?.event && (
                    <p>
                      Публикация:{' '}
                      <strong>
                        {eventDetail.event.isPublished
                          ? 'Опубликовано'
                          : 'Черновик'}
                      </strong>
                      {' · Регистрация: '}
                      {EVENT_STATUS_LABELS[eventDetail.event.status] ??
                        eventDetail.event.status}
                      {' · '}
                      {eventDetail.event.city}
                    </p>
                  )}
                </div>
                <div className="adminWorkspaceHeaderActions">
                  {eventDetail?.event && (
                    <>
                      <a
                        className="adminInlineButton adminPreviewLink"
                        href={`/events/${eventDetail.event.slug}?preview=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Предпросмотр
                      </a>
                      <button
                        className="adminInlineButton"
                        type="button"
                        onClick={handleSaveEvent}
                        disabled={
                          eventSaveStatus === 'saving' ||
                          isGroupSaving ||
                          isDistanceSaving ||
                          isRequirementSaving
                        }
                      >
                        {eventDetail.event.isPublished
                          ? 'Сохранить изменения'
                          : 'Сохранить черновик'}
                      </button>
                      <button
                        className={
                          eventDetail.event.isPublished
                            ? 'adminEventCancelButton'
                            : 'adminEventSaveButton'
                        }
                        type="button"
                        onClick={() =>
                          handlePublicationChange(
                            eventDetail.event.isPublished
                              ? 'unpublish'
                              : 'publish',
                          )
                        }
                        disabled={
                          eventSaveStatus === 'saving' ||
                          isGroupSaving ||
                          isDistanceSaving ||
                          isRequirementSaving
                        }
                      >
                        {eventDetail.event.isPublished
                          ? 'Снять с публикации'
                          : 'Разместить на сайте'}
                      </button>
                      {!eventDetail.event.isPublished && (
                        <button
                          className="adminDeleteButton"
                          type="button"
                          onClick={() =>
                            setEventDeleteState({
                              confirming: true,
                              status: 'idle',
                              message: '',
                            })
                          }
                          disabled={
                            eventSaveStatus === 'saving' ||
                            eventDeleteState.status === 'deleting' ||
                            isGroupSaving ||
                            isDistanceSaving ||
                            isRequirementSaving
                          }
                        >
                          Удалить мероприятие
                        </button>
                      )}
                    </>
                  )}
                  {workspaceModule && (
                    <button
                      className="adminInlineButton"
                      type="button"
                      onClick={() => setWorkspaceModule(null)}
                    >
                      К рабочей области
                    </button>
                  )}
                  <button
                    className="adminEventCancelButton"
                    type="button"
                    onClick={() => {
                      setSelectedEventId(null)
                      setWorkspaceModule(null)
                      setEventDetail(null)
                      setEventDetailStatus('idle')
                    }}
                  >
                    К мероприятиям
                  </button>
                </div>
              </div>

              {!eventDetail?.event?.isPublished &&
                eventDeleteState.confirming && (
                  <div
                    className="adminDeleteConfirmation"
                    role="alertdialog"
                    aria-labelledby="admin-delete-event-title"
                    aria-describedby="admin-delete-event-description"
                  >
                    <div>
                      <strong id="admin-delete-event-title">
                        {eventDetail.event.title}
                      </strong>
                      <p id="admin-delete-event-description">
                        Мероприятие будет удалено без возможности восстановления.
                      </p>
                    </div>
                    <div className="adminDeleteConfirmationActions">
                      <button
                        className="adminDeleteConfirmButton"
                        type="button"
                        onClick={handleDeleteEvent}
                        disabled={eventDeleteState.status === 'deleting'}
                      >
                        {eventDeleteState.status === 'deleting'
                          ? 'Удаляем...'
                          : 'Удалить безвозвратно'}
                      </button>
                      <button
                        className="adminEventCancelButton"
                        type="button"
                        onClick={() =>
                          setEventDeleteState({
                            confirming: false,
                            status: 'idle',
                            message: '',
                          })
                        }
                        disabled={eventDeleteState.status === 'deleting'}
                      >
                        Отмена
                      </button>
                    </div>
                    {eventDeleteState.message && (
                      <p className="adminAuthMessage" role="alert">
                        {eventDeleteState.message}
                      </p>
                    )}
                  </div>
                )}

              {eventDetailStatus === 'ready' && eventDetailMessage && (
                <p className="adminSaveSuccess" role="status">
                  {eventDetailMessage}
                </p>
              )}

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
                {!workspaceModule && (
                  <div className="adminWorkspaceGrid">
                    {WORKSPACE_MODULES.map((item, index) => {
                      const counters = {
                        registration: `${eventDetail.documents?.length ?? 0} док. · ${eventDetail.consents?.length ?? 0} согл.`,
                        distances: `${eventDetail.groups?.length ?? 0} групп · ${eventDetail.distances?.length ?? 0} дистанций`,
                        kit: `${eventDetail.kitItems?.length ?? 0} предметов`,
                        partners: `${eventDetail.partners?.length ?? 0} партнёров`,
                      }

                      return (
                        <button
                          className="adminWorkspaceCard"
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setWorkspaceModule(item.id)
                            if (item.id === 'registration') {
                              setRegistrationTab('settings')
                            }
                          }}
                        >
                          <span className="adminWorkspaceCardIndex">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <strong>{item.title}</strong>
                          <small>{item.description}</small>
                          {counters[item.id] && <em>{counters[item.id]}</em>}
                        </button>
                      )
                    })}
                  </div>
                )}

                {workspaceModule && (
                  <div className="adminWorkspaceModuleHeading">
                    <p className="adminPageEyebrow">Раздел</p>
                    <h3>
                      {WORKSPACE_MODULES.find(
                        (item) => item.id === workspaceModule,
                      )?.title}
                    </h3>
                  </div>
                )}

                {workspaceModule === 'registration' && (
                  <div className="adminWorkspaceTabs" role="tablist">
                    {[
                      ['settings', 'Настройки'],
                      ['documents', 'Документы'],
                      ['consents', 'Согласия'],
                    ].map(([value, label]) => (
                      <button
                        className={
                          registrationTab === value ? 'isActive' : ''
                        }
                        type="button"
                        role="tab"
                        aria-selected={registrationTab === value}
                        key={value}
                        onClick={() => setRegistrationTab(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {(workspaceModule === 'main' ||
                  (workspaceModule === 'registration' &&
                    registrationTab === 'settings')) && (
                <form
                  className="adminEventForm"
                  onSubmit={handleSaveEvent}
                >
                  <section className="adminReadinessPanel" aria-label="Готовность мероприятия">
                    <div className="adminReadinessHeader">
                      <div>
                        <p className="adminPageEyebrow">Готовность</p>
                        <h3>Публикация и регистрация</h3>
                      </div>
                      <label className="adminEventField adminStatusControl">
                        <span>Статус регистрации</span>
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
                    <div className="adminReadinessChecklist">
                      <span className={eventReadiness?.publicPage.ready ? 'isReady' : 'isMissing'}>
                        {eventReadiness?.publicPage.ready ? '✓' : '○'} Публичная страница
                      </span>
                      <span className={(eventReadiness?.summary.groupCount ?? 0) > 0 ? 'isReady' : 'isMissing'}>
                        {(eventReadiness?.summary.groupCount ?? 0) > 0 ? '✓' : '○'} Группы: {eventReadiness?.summary.groupCount ?? 0}
                      </span>
                      <span className={(eventReadiness?.summary.distanceCount ?? 0) > 0 ? 'isReady' : 'isMissing'}>
                        {(eventReadiness?.summary.distanceCount ?? 0) > 0 ? '✓' : '○'} Дистанции: {eventReadiness?.summary.distanceCount ?? 0}
                      </span>
                      <span className="isReady">
                        {eventReadiness?.summary.documentCount ? '✓' : '○'} Документы:{' '}
                        {eventReadiness?.summary.documentCount || 'не требуются'}
                      </span>
                      <span className="isReady">
                        {eventReadiness?.summary.consentCount ? '✓' : '○'} Согласия:{' '}
                        {eventReadiness?.summary.consentCount || 'не требуются'}
                      </span>
                    </div>
                    <p className={eventReadiness?.registration.ready ? 'adminReadinessSuccess' : 'adminReadinessWarning'}>
                      {eventReadiness?.registration.ready
                        ? 'Регистрация технически настроена.'
                        : READINESS_REASON_LABELS[eventReadiness?.registration.reasons[0]] ??
                          'Регистрация ещё не настроена.'}
                    </p>
                  </section>

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

                  {workspaceModule === 'main' && (
                    <>
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
                        <span>Тип мероприятия</span>
                        <input
                          name="eventType"
                          type="text"
                          value={eventForm.eventType}
                          onChange={handleEventFormChange}
                          required
                        />
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

                    </>
                  )}

                  {workspaceModule === 'registration' && (
                  <fieldset className="adminEventFormGroup">
                    <legend>Регистрация и стоимость</legend>
                    <div className="adminEventFormGrid">
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
                            Дети и взрослые регистрируются через разные
                            группы дистанций.
                          </small>
                        )}
                      </label>

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
                  )}

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
                        : eventDetail.event.isPublished
                          ? 'Сохранить изменения'
                          : 'Сохранить черновик'}
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

                {workspaceModule === 'distances' && (
                  <>
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
                    <p>Добавьте первую группу, чтобы настроить регистрацию.</p>
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
                    <p>Добавьте первую дистанцию для доступной группы.</p>
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

                {workspaceModule === 'registration' &&
                  registrationTab !== 'settings' && (
                <section className="adminDistancesSection adminRequirementsSection">
                  <div className="adminDistancesHeader">
                    <div>
                      <p className="adminPageEyebrow">Регистрация</p>
                      <h3>
                        {registrationTab === 'documents'
                          ? 'Документы'
                          : 'Согласия'}
                      </h3>
                    </div>
                  </div>
                  <p className="adminSectionHint">
                    Документы — файлы, которые участник должен
                    предоставить. Согласия — тексты, которые участник
                    подтверждает при регистрации.
                  </p>

                  {registrationTab === 'documents' && (
                  <div className="adminRequirementBlock">
                    <div className="adminDistanceCardHeader">
                      <h4>Документы</h4>
                      <span>{eventDetail.documents?.length ?? 0}</span>
                    </div>

                    <form
                      className="adminDistanceCard adminDistanceCreateCard"
                      onSubmit={handleCreateDocument}
                      noValidate
                    >
                      <div className="adminDistanceCardHeader">
                        <h4>Добавить документ</h4>
                      </div>
                      <DocumentRequirementFields
                        form={newDocumentForm}
                        onChange={handleNewDocumentFormChange}
                      />
                      <div className="adminEventFormActions">
                        <button
                          className="adminEventSaveButton"
                          type="submit"
                          disabled={
                            eventSaveStatus === 'saving' ||
                            isGroupSaving ||
                            isDistanceSaving ||
                            isRequirementSaving ||
                            isNextDocumentSortOrderUnavailable
                          }
                        >
                          {newDocumentSaveState.status === 'saving'
                            ? 'Добавляем...'
                            : 'Добавить документ'}
                        </button>
                        <RequirementSaveMessage
                          state={newDocumentSaveState}
                        />
                      </div>

                      {isNextDocumentSortOrderUnavailable && (
                        <p className="adminAuthMessage" role="alert">
                          Нельзя вычислить следующий порядок: достигнут
                          лимит 32767.
                        </p>
                      )}
                    </form>

                    {(eventDetail.documents?.length ?? 0) === 0 && (
                      <p>Для мероприятия документы не требуются.</p>
                    )}

                    {(eventDetail.documents?.length ?? 0) > 0 && (
                      <div className="adminDistanceCards">
                        {eventDetail.documents.map((document) => {
                          const form = documentForms[document.id]
                          const saveState =
                            documentSaveStates[document.id] ?? {
                              status: 'idle',
                              message: '',
                            }

                          if (!form) {
                            return null
                          }

                          return (
                            <form
                              className="adminDistanceCard"
                              key={document.id}
                              onSubmit={(submitEvent) =>
                                handleSaveDocument(
                                  submitEvent,
                                  document.id,
                                )
                              }
                              noValidate
                            >
                              <div className="adminDistanceCardHeader">
                                <h4>{form.title || 'Без названия'}</h4>
                                <span>
                                  {form.documentType || 'Без типа'}
                                </span>
                              </div>
                              <DocumentRequirementFields
                                form={form}
                                onChange={(changeEvent) =>
                                  handleDocumentFormChange(
                                    document.id,
                                    changeEvent,
                                  )
                                }
                              />
                              <div className="adminEventFormActions">
                                <button
                                  className="adminEventSaveButton"
                                  type="submit"
                                  disabled={
                                    eventSaveStatus === 'saving' ||
                                    isGroupSaving ||
                                    isDistanceSaving ||
                                    isRequirementSaving
                                  }
                                >
                                  {saveState.status === 'saving'
                                    ? 'Сохраняем...'
                                    : 'Сохранить документ'}
                                </button>
                                <RequirementSaveMessage state={saveState} />
                              </div>
                            </form>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  )}

                  {registrationTab === 'consents' && (
                  <div className="adminRequirementBlock">
                    <div className="adminDistanceCardHeader">
                      <h4>Согласия</h4>
                      <span>{eventDetail.consents?.length ?? 0}</span>
                    </div>

                    <form
                      className="adminDistanceCard adminDistanceCreateCard"
                      onSubmit={handleCreateConsent}
                      noValidate
                    >
                      <div className="adminDistanceCardHeader">
                        <h4>Добавить согласие</h4>
                      </div>
                      <ConsentRequirementFields
                        form={newConsentForm}
                        onChange={handleNewConsentFormChange}
                      />
                      <div className="adminEventFormActions">
                        <button
                          className="adminEventSaveButton"
                          type="submit"
                          disabled={
                            eventSaveStatus === 'saving' ||
                            isGroupSaving ||
                            isDistanceSaving ||
                            isRequirementSaving ||
                            isNextConsentSortOrderUnavailable
                          }
                        >
                          {newConsentSaveState.status === 'saving'
                            ? 'Добавляем...'
                            : 'Добавить согласие'}
                        </button>
                        <RequirementSaveMessage
                          state={newConsentSaveState}
                        />
                      </div>

                      {isNextConsentSortOrderUnavailable && (
                        <p className="adminAuthMessage" role="alert">
                          Нельзя вычислить следующий порядок: достигнут
                          лимит 32767.
                        </p>
                      )}
                    </form>

                    {(eventDetail.consents?.length ?? 0) === 0 && (
                      <p>
                        Для мероприятия дополнительные согласия не
                        настроены.
                      </p>
                    )}

                    {(eventDetail.consents?.length ?? 0) > 0 && (
                      <div className="adminDistanceCards">
                        {eventDetail.consents.map((consent) => {
                          const form = consentForms[consent.id]
                          const saveState =
                            consentSaveStates[consent.id] ?? {
                              status: 'idle',
                              message: '',
                            }

                          if (!form) {
                            return null
                          }

                          return (
                            <form
                              className="adminDistanceCard"
                              key={consent.id}
                              onSubmit={(submitEvent) =>
                                handleSaveConsent(
                                  submitEvent,
                                  consent.id,
                                )
                              }
                              noValidate
                            >
                              <div className="adminDistanceCardHeader">
                                <h4>{form.title || 'Без названия'}</h4>
                                <span>
                                  {form.consentType || 'Без типа'}
                                </span>
                              </div>
                              <ConsentRequirementFields
                                form={form}
                                onChange={(changeEvent) =>
                                  handleConsentFormChange(
                                    consent.id,
                                    changeEvent,
                                  )
                                }
                              />
                              <div className="adminEventFormActions">
                                <button
                                  className="adminEventSaveButton"
                                  type="submit"
                                  disabled={
                                    eventSaveStatus === 'saving' ||
                                    isGroupSaving ||
                                    isDistanceSaving ||
                                    isRequirementSaving
                                  }
                                >
                                  {saveState.status === 'saving'
                                    ? 'Сохраняем...'
                                    : 'Сохранить согласие'}
                                </button>
                                <RequirementSaveMessage state={saveState} />
                              </div>
                            </form>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  )}
                </section>
                )}

                {workspaceModule === 'kit' && (
                  <AdminStarterKit
                    key={`kit-${eventDetail.event.id}`}
                    eventId={eventDetail.event.id}
                    onKitItemsChange={(kitItems) =>
                      setEventDetail((currentDetail) => ({
                        ...currentDetail,
                        kitItems,
                      }))
                    }
                    onUnauthorized={handleAdminUnauthorized}
                  />
                )}

                {['partners', 'participants'].includes(workspaceModule) && (
                  <AdminEventManagement
                    key={`${workspaceModule}-${eventDetail.event.id}`}
                    module={workspaceModule}
                    eventId={eventDetail.event.id}
                    partners={eventDetail.partners ?? []}
                    distances={eventDetail.distances ?? []}
                    onPartnersChange={(partners) =>
                      setEventDetail((currentDetail) => ({
                        ...currentDetail,
                        partners,
                      }))
                    }
                    onUnauthorized={handleAdminUnauthorized}
                    disabled={
                      eventSaveStatus === 'saving' ||
                      isGroupSaving ||
                      isDistanceSaving ||
                      isRequirementSaving
                    }
                  />
                )}
                </>
              )}
            </section>
          )}

        </div>
      </main>
    </div>
  )
}

export default AdminPage
