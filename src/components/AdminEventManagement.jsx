import { useEffect, useState } from 'react'
import {
  AdminAuthError,
  createAdminPartner,
  getAdminRegistration,
  getAdminRegistrations,
  updateAdminPartner,
} from '../api/admin'

const STATUS_OPTIONS = [
  ['', 'Все статусы'],
  ['pending_payment', 'Ожидает оплаты'],
  ['confirmed', 'Подтверждена'],
  ['expired', 'Истекла'],
  ['cancelled', 'Отменена'],
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS)
const PAYMENT_STATUS_LABELS = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка',
  cancelled: 'Отменён',
  refund_pending: 'Возврат обрабатывается',
  refunded: 'Возвращён',
}

class ManagementFormError extends Error {}

function nextSortOrder(items) {
  if (!items.length) {
    return 0
  }

  const highest = Math.max(...items.map((item) => item.sortOrder))
  return highest >= 32767 ? null : highest + 1
}

function parseSortOrder(value) {
  if (!/^\d+$/.test(value.trim())) {
    throw new ManagementFormError('Порядок должен быть целым числом.')
  }

  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 32767) {
    throw new ManagementFormError('Порядок должен быть от 0 до 32767.')
  }

  return parsed
}

function partnerForm(partner = {}, partners = []) {
  const order = nextSortOrder(partners)

  return {
    name: partner.name ?? '',
    logoPath: partner.logoPath ?? '',
    websiteUrl: partner.websiteUrl ?? '',
    category: partner.category ?? '',
    sortOrder: String(partner.sortOrder ?? order ?? ''),
  }
}

function buildPartnerChanges(form) {
  const name = form.name.trim()

  if (!name) {
    throw new ManagementFormError('Название партнёра обязательно.')
  }

  return {
    name,
    logoPath: form.logoPath.trim() || null,
    websiteUrl: form.websiteUrl.trim() || null,
    category: form.category.trim() || null,
    sortOrder: parseSortOrder(form.sortOrder),
  }
}

function makeForms(items, createForm) {
  return Object.fromEntries(
    items.map((item) => [item.id, createForm(item)]),
  )
}

function formatMoney(amountMinor, currency) {
  if (!Number.isFinite(amountMinor)) {
    return '—'
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency || 'KZT',
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function SaveMessage({ state }) {
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

function PartnerFields({ form, onChange }) {
  return (
    <div className="adminRequirementFormGrid">
      <label className="adminEventField">
        <span>Название</span>
        <input name="name" value={form.name} onChange={onChange} required />
      </label>
      <label className="adminEventField">
        <span>Категория</span>
        <input name="category" value={form.category} onChange={onChange} />
      </label>
      <label className="adminEventField adminRequirementFieldWide">
        <span>Сайт</span>
        <input
          name="websiteUrl"
          type="url"
          value={form.websiteUrl}
          onChange={onChange}
        />
      </label>
      <label className="adminEventField adminRequirementFieldWide">
        <span>Путь к логотипу</span>
        <input name="logoPath" value={form.logoPath} onChange={onChange} />
      </label>
      <label className="adminEventField">
        <span>Порядок</span>
        <input
          name="sortOrder"
          type="number"
          min="0"
          max="32767"
          value={form.sortOrder}
          onChange={onChange}
          required
        />
      </label>
    </div>
  )
}

function registrationErrorMessage(error) {
  if (error instanceof AdminAuthError && error.status === 404) {
    return 'Регистрация не найдена.'
  }

  if (error instanceof AdminAuthError && error.status === 400) {
    return 'Проверьте параметры фильтра.'
  }

  return 'Не удалось загрузить регистрации.'
}

function DetailValue({ label, value }) {
  return (
    <div className="adminRegistrationDetailValue">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  )
}

function RegistrationDetail({ detail, onClose }) {
  const { registration, adult, child, documents, consents, payments } = detail
  const person = adult ?? child

  return (
    <section className="adminRegistrationDetail" aria-label="Регистрация">
      <div className="adminDistanceCardHeader">
        <div>
          <p className="adminPageEyebrow">Регистрация</p>
          <h4>{registration.publicId || 'Без публичного номера'}</h4>
        </div>
        <button className="adminInlineButton" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>

      <div className="adminRegistrationDetailGrid">
        <div className="adminRegistrationDetailGroup">
          <h5>Регистрация</h5>
          <dl>
            <DetailValue
              label="Статус"
              value={STATUS_LABELS[registration.status] ?? registration.status}
            />
            <DetailValue label="Дистанция" value={registration.distance?.title} />
            <DetailValue label="Группа" value={registration.group?.title} />
            <DetailValue
              label="Сумма"
              value={formatMoney(registration.amountMinor, registration.currency)}
            />
            <DetailValue
              label="Создана"
              value={formatDateTime(registration.createdAt)}
            />
            <DetailValue
              label="Подтверждена"
              value={formatDateTime(registration.confirmedAt)}
            />
          </dl>
        </div>

        <div className="adminRegistrationDetailGroup">
          <h5>{adult ? 'Участник' : 'Ребёнок'}</h5>
          <dl>
            <DetailValue label="Имя" value={person?.displayName} />
            <DetailValue label="Дата рождения" value={person?.birthDate} />
            <DetailValue
              label="Пол"
              value={person?.gender === 'male' ? 'Мужской' : person?.gender === 'female' ? 'Женский' : null}
            />
          </dl>
        </div>

        <div className="adminRegistrationDetailGroup">
          <h5>{adult ? 'Контакт' : 'Родитель'}</h5>
          <dl>
            {!adult && <DetailValue label="Имя" value={child?.parent?.fullName} />}
            <DetailValue
              label="Телефон"
              value={adult?.phone ?? child?.parent?.phone}
            />
            <DetailValue
              label="Email"
              value={adult?.email ?? child?.parent?.email}
            />
          </dl>
        </div>
      </div>

      <div className="adminRegistrationRelatedGrid">
        <div>
          <h5>Документы</h5>
          {documents.length === 0 ? (
            <p>Документы не загружены.</p>
          ) : (
            <ul>
              {documents.map((document, index) => (
                <li key={`${document.documentType}-${index}`}>
                  <strong>{document.originalFilename}</strong>
                  <span>{document.documentType}</span>
                  <span>{Math.round(document.sizeBytes / 1024)} КБ</span>
                  {document.signedUrl && (
                    <a href={document.signedUrl} target="_blank" rel="noreferrer">
                      Открыть документ
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h5>Согласия</h5>
          {consents.length === 0 ? (
            <p>Согласия не найдены.</p>
          ) : (
            <ul>
              {consents.map((consent) => (
                <li key={consent.consentType}>
                  <strong>{consent.consentType}</strong>
                  <span>Версия {consent.consentVersion}</span>
                  <span>{formatDateTime(consent.acceptedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h5>Платежи</h5>
          {payments.length === 0 ? (
            <p>Платежей пока нет.</p>
          ) : (
            <ul>
              {payments.map((payment, index) => (
                <li key={`${payment.providerPaymentId ?? 'payment'}-${index}`}>
                  <strong>{payment.provider}</strong>
                  <span>
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </span>
                  <span>{formatMoney(payment.amountMinor, payment.currency)}</span>
                  <span>{formatDateTime(payment.createdAt)}</span>
                  {payment.failureCode && <span>Код: {payment.failureCode}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function AdminEventManagement({
  module,
  eventId,
  partners,
  distances,
  onPartnersChange,
  onUnauthorized,
  disabled,
}) {
  const [partnerForms, setPartnerForms] = useState(() =>
    makeForms(partners, partnerForm),
  )
  const [newPartnerForm, setNewPartnerForm] = useState(() =>
    partnerForm({}, partners),
  )
  const [partnerStates, setPartnerStates] = useState({})
  const [newPartnerState, setNewPartnerState] = useState({
    status: 'idle',
    message: '',
  })
  const [registrationFilters, setRegistrationFilters] = useState({
    search: '',
    status: '',
    distanceId: '',
    page: 1,
    pageSize: 50,
  })
  const [filterForm, setFilterForm] = useState(registrationFilters)
  const [registrationRefresh, setRegistrationRefresh] = useState(0)
  const [registrationsState, setRegistrationsState] = useState({
    status: 'loading',
    message: '',
    rows: [],
    total: 0,
    summary: {
      total: 0,
      pending_payment: 0,
      confirmed: 0,
      expired: 0,
      cancelled: 0,
    },
  })
  const [registrationDetailState, setRegistrationDetailState] = useState({
    status: 'idle',
    message: '',
    data: null,
  })

  useEffect(() => {
    if (module !== 'participants') {
      return undefined
    }

    const controller = new AbortController()
    let active = true

    setRegistrationsState((current) => ({
      ...current,
      status: 'loading',
      message: '',
    }))

    getAdminRegistrations(eventId, registrationFilters, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return
        setRegistrationsState({
          status: 'ready',
          message: '',
          rows: Array.isArray(result.rows) ? result.rows : [],
          total: result.total ?? 0,
          summary: result.summary ?? {},
        })
      })
      .catch((error) => {
        if (!active) return
        if (error instanceof AdminAuthError && error.status === 401) {
          onUnauthorized()
          return
        }
        setRegistrationsState((current) => ({
          ...current,
          status: 'error',
          message: registrationErrorMessage(error),
          rows: [],
        }))
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [eventId, module, onUnauthorized, registrationFilters, registrationRefresh])

  const handleRequestError = (error, fallback, conflictMessage) => {
    if (error instanceof AdminAuthError && error.status === 401) {
      onUnauthorized()
      return null
    }
    if (error instanceof AdminAuthError && error.status === 409) {
      return conflictMessage
    }
    if (error instanceof AdminAuthError && error.status === 404) {
      return 'Элемент или мероприятие не найдено.'
    }
    if (error instanceof AdminAuthError && error.status === 400) {
      return 'Проверьте заполненные данные.'
    }
    return fallback
  }

  const updateForm = (setter, stateSetter, id, event) => {
    const { name, value } = event.target
    setter((current) => ({
      ...current,
      [id]: { ...current[id], [name]: value },
    }))
    stateSetter((current) => ({
      ...current,
      [id]: { status: 'idle', message: '' },
    }))
  }

  const savePartner = async (event, partnerId) => {
    event.preventDefault()
    let changes
    try {
      changes = buildPartnerChanges(partnerForms[partnerId])
    } catch (error) {
      setPartnerStates((current) => ({
        ...current,
        [partnerId]: { status: 'error', message: error.message },
      }))
      return
    }
    setPartnerStates((current) => ({
      ...current,
      [partnerId]: { status: 'saving', message: '' },
    }))
    try {
      const result = await updateAdminPartner(eventId, partnerId, changes)
      const next = partners.map((partner) =>
        partner.id === result.partner.id ? result.partner : partner,
      )
      onPartnersChange(next)
      setPartnerForms((current) => ({
        ...current,
        [partnerId]: partnerForm(result.partner),
      }))
      setPartnerStates((current) => ({
        ...current,
        [partnerId]: { status: 'success', message: 'Сохранено' },
      }))
    } catch (error) {
      const message = handleRequestError(
        error,
        'Не удалось сохранить партнёра.',
        'Не удалось сохранить партнёра.',
      )
      if (message) {
        setPartnerStates((current) => ({
          ...current,
          [partnerId]: { status: 'error', message },
        }))
      }
    }
  }

  const createPartner = async (event) => {
    event.preventDefault()
    let changes
    try {
      changes = buildPartnerChanges(newPartnerForm)
    } catch (error) {
      setNewPartnerState({ status: 'error', message: error.message })
      return
    }
    setNewPartnerState({ status: 'saving', message: '' })
    try {
      const result = await createAdminPartner(eventId, changes)
      const next = [...partners, result.partner]
      onPartnersChange(next)
      setPartnerForms((current) => ({
        ...current,
        [result.partner.id]: partnerForm(result.partner),
      }))
      setNewPartnerForm(partnerForm({}, next))
      setNewPartnerState({ status: 'success', message: 'Партнёр добавлен' })
    } catch (error) {
      const message = handleRequestError(
        error,
        'Не удалось добавить партнёра.',
        'Не удалось добавить партнёра.',
      )
      if (message) setNewPartnerState({ status: 'error', message })
    }
  }

  const openRegistration = async (registrationId) => {
    setRegistrationDetailState({ status: 'loading', message: '', data: null })
    try {
      const result = await getAdminRegistration(eventId, registrationId)
      setRegistrationDetailState({ status: 'ready', message: '', data: result })
    } catch (error) {
      if (error instanceof AdminAuthError && error.status === 401) {
        onUnauthorized()
        return
      }
      setRegistrationDetailState({
        status: 'error',
        message: registrationErrorMessage(error),
        data: null,
      })
    }
  }

  const isPartnerSaving =
    newPartnerState.status === 'saving' ||
    Object.values(partnerStates).some(({ status }) => status === 'saving')
  const writesDisabled = disabled || isPartnerSaving
  const pageCount = Math.max(
    1,
    Math.ceil(registrationsState.total / registrationFilters.pageSize),
  )

  return (
    <>
      {module === 'partners' && (
      <section className="adminDistancesSection">
        <div className="adminDistancesHeader">
          <div><p className="adminPageEyebrow">Экосистема</p><h3>Партнёры</h3></div>
          <span>{partners.length}</span>
        </div>
        <form className="adminDistanceCard adminDistanceCreateCard" onSubmit={createPartner} noValidate>
          <div className="adminDistanceCardHeader"><h4>Добавить партнёра</h4></div>
          <PartnerFields
            form={newPartnerForm}
            onChange={(event) => {
              setNewPartnerForm((current) => ({ ...current, [event.target.name]: event.target.value }))
              setNewPartnerState({ status: 'idle', message: '' })
            }}
          />
          <div className="adminEventFormActions">
            <button className="adminEventSaveButton" type="submit" disabled={writesDisabled || nextSortOrder(partners) === null}>{newPartnerState.status === 'saving' ? 'Добавляем...' : 'Добавить партнёра'}</button>
            <SaveMessage state={newPartnerState} />
          </div>
        </form>
        {partners.length === 0 ? <p>Партнёры пока не добавлены.</p> : (
          <div className="adminDistanceCards">
            {partners.map((partner) => {
              const form = partnerForms[partner.id]
              const state = partnerStates[partner.id] ?? { status: 'idle', message: '' }
              if (!form) return null
              return (
                <form className="adminDistanceCard" key={partner.id} onSubmit={(event) => savePartner(event, partner.id)} noValidate>
                  <div className="adminDistanceCardHeader"><h4>{form.name || 'Без названия'}</h4><span>{form.category || 'Партнёр'}</span></div>
                  <PartnerFields form={form} onChange={(event) => updateForm(setPartnerForms, setPartnerStates, partner.id, event)} />
                  <div className="adminEventFormActions">
                    <button className="adminEventSaveButton" type="submit" disabled={writesDisabled}>{state.status === 'saving' ? 'Сохраняем...' : 'Сохранить партнёра'}</button>
                    <SaveMessage state={state} />
                  </div>
                </form>
              )
            })}
          </div>
        )}
      </section>
      )}

      {module === 'participants' && (
      <section className="adminDistancesSection adminRegistrationsSection">
        <div className="adminDistancesHeader">
          <div><p className="adminPageEyebrow">Участники</p><h3>Регистрации</h3></div>
          <button className="adminInlineButton" type="button" onClick={() => setRegistrationRefresh((value) => value + 1)} disabled={registrationsState.status === 'loading'}>Обновить</button>
        </div>

        <div className="adminRegistrationSummary">
          <span><strong>{registrationsState.summary.total ?? 0}</strong>Всего</span>
          <span><strong>{registrationsState.summary.confirmed ?? 0}</strong>Подтверждено</span>
          <span><strong>{registrationsState.summary.pending_payment ?? 0}</strong>Ожидает оплаты</span>
          <span><strong>{registrationsState.summary.expired ?? 0}</strong>Истекло</span>
          <span><strong>{registrationsState.summary.cancelled ?? 0}</strong>Отменено</span>
        </div>

        <form
          className="adminRegistrationFilters"
          onSubmit={(event) => {
            event.preventDefault()
            setRegistrationFilters({ ...filterForm, page: 1, pageSize: 50 })
            setRegistrationDetailState({ status: 'idle', message: '', data: null })
          }}
        >
          <label className="adminEventField"><span>Поиск</span><input value={filterForm.search} onChange={(event) => setFilterForm((current) => ({ ...current, search: event.target.value }))} placeholder="Номер, имя, email или телефон" /></label>
          <label className="adminEventField"><span>Статус</span><select value={filterForm.status} onChange={(event) => setFilterForm((current) => ({ ...current, status: event.target.value }))}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="adminEventField"><span>Дистанция</span><select value={filterForm.distanceId} onChange={(event) => setFilterForm((current) => ({ ...current, distanceId: event.target.value }))}><option value="">Все дистанции</option>{distances.map((distance) => <option value={distance.id} key={distance.id}>{distance.title}</option>)}</select></label>
          <button className="adminEventSaveButton" type="submit">Применить</button>
        </form>

        {registrationsState.status === 'loading' && <p>Загружаем регистрации...</p>}
        {registrationsState.status === 'error' && <p className="adminAuthMessage" role="alert">{registrationsState.message}</p>}
        {registrationsState.status === 'ready' && registrationsState.rows.length === 0 && <p>Регистраций пока нет.</p>}
        {registrationsState.status === 'ready' && registrationsState.rows.length > 0 && (
          <div className="adminRegistrationTableWrap">
            <table className="adminRegistrationTable">
              <thead><tr><th>ID</th><th>Участник</th><th>Дистанция</th><th>Статус</th><th>Контакт</th><th>Сумма</th><th>Дата</th><th /></tr></thead>
              <tbody>
                {registrationsState.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.publicId || 'Временная'}</td><td><strong>{row.displayName}</strong><small>{row.participantType === 'child' ? 'Ребёнок' : 'Взрослый'}</small></td><td>{row.distance?.title ?? '—'}</td><td>{STATUS_LABELS[row.status] ?? row.status}</td><td>{row.contactPhone || row.contactEmail || '—'}</td><td>{formatMoney(row.amountMinor, row.currency)}</td><td>{formatDateTime(row.createdAt)}</td><td><button className="adminInlineButton" type="button" onClick={() => openRegistration(row.id)}>Открыть</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="adminRegistrationPagination">
          <button className="adminInlineButton" type="button" disabled={registrationFilters.page <= 1 || registrationsState.status === 'loading'} onClick={() => setRegistrationFilters((current) => ({ ...current, page: current.page - 1 }))}>Назад</button>
          <span>Страница {registrationFilters.page} из {pageCount}</span>
          <button className="adminInlineButton" type="button" disabled={registrationFilters.page >= pageCount || registrationsState.status === 'loading'} onClick={() => setRegistrationFilters((current) => ({ ...current, page: current.page + 1 }))}>Вперёд</button>
        </div>

        {registrationDetailState.status === 'loading' && <p>Загружаем регистрацию...</p>}
        {registrationDetailState.status === 'error' && <p className="adminAuthMessage" role="alert">{registrationDetailState.message}</p>}
        {registrationDetailState.status === 'ready' && registrationDetailState.data && <RegistrationDetail detail={registrationDetailState.data} onClose={() => setRegistrationDetailState({ status: 'idle', message: '', data: null })} />}
      </section>
      )}
    </>
  )
}

export default AdminEventManagement
