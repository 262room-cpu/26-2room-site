import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EVENT_FETCH_STATUSES, fetchEventBySlug } from '../api/events'
import KidsRegistrationForm from '../components/KidsRegistrationForm'
import { EVENT_STATUSES } from '../data/events'
import './RegistrationPage.css'

const STATUS_GATE_CONTENT = {
  [EVENT_STATUSES.DRAFT]: {
    title: 'Регистрация пока недоступна',
    description: 'Информация о мероприятии готовится.',
  },
  [EVENT_STATUSES.COMING_SOON]: {
    title: 'Регистрация скоро откроется',
    description: 'Регистрация откроется после подтверждения даты.',
  },
  [EVENT_STATUSES.SOLD_OUT]: {
    title: 'Все места заняты',
    description: 'Лимит участников на это мероприятие исчерпан.',
  },
  [EVENT_STATUSES.CLOSED]: {
    title: 'Регистрация завершена',
    description: 'Приём заявок на это мероприятие закрыт.',
  },
  [EVENT_STATUSES.FINISHED]: {
    title: 'Мероприятие завершено',
    description: 'Регистрация на прошедшее мероприятие недоступна.',
  },
}

function formatEventDate(value) {
  if (!value) {
    return null
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function formatPrice(price, currency) {
  if (price === null || price === undefined) {
    return null
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(price)
}

function toMajorAmount(value) {
  if (value === null || value === undefined || typeof value !== 'number') {
    return null
  }

  return value / 100
}

function adaptRegistrationEvent(event) {
  return {
    ...event,
    price: toMajorAmount(event.priceMinor),
    distances: (event.distances ?? []).map((distance) => ({
      ...distance,
      id: distance.code,
      price: toMajorAmount(distance.priceMinor),
    })),
  }
}

function RegistrationHeader({ event }) {
  return (
    <header className="registrationPageHeader">
      <Link className="registrationPageBrand" to="/">
        <img src="/logo-26-2room.jpg.jpg" alt="26.2 ROOM" />
        <span>26.2 ROOM</span>
      </Link>

      <Link className="registrationPageBackLink" to={event ? `/events/${event.slug}` : '/'}>
        {event ? 'Вернуться к мероприятию' : 'На главную'}
      </Link>
    </header>
  )
}

function RegistrationPageMessage({ title, description, loading = false }) {
  return (
    <div className="registrationPage">
      <RegistrationHeader event={null} />

      <main
        className="registrationPageNotFound registrationPageMessage"
        aria-busy={loading}
        aria-live="polite"
      >
        {loading && <span className="registrationPageLoader" aria-hidden="true" />}
        <p className="registrationPageEyebrow">REGISTRATION</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {!loading && (
          <Link className="registrationPagePrimaryLink" to="/">
            Вернуться на главную
          </Link>
        )}
      </main>
    </div>
  )
}

function RegistrationPage() {
  const { slug } = useParams()
  const [eventRequest, setEventRequest] = useState({
    slug: null,
    status: null,
    event: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    fetchEventBySlug(slug, { signal: controller.signal })
      .then((result) => {
        if (!isActive) {
          return
        }

        setEventRequest({
          slug,
          status: result.status,
          event:
            result.status === EVENT_FETCH_STATUSES.SUCCESS
              ? adaptRegistrationEvent(result.event)
              : null,
        })
      })
      .catch((error) => {
        if (!isActive || error?.name === 'AbortError') {
          return
        }

        setEventRequest({ slug, status: EVENT_FETCH_STATUSES.ERROR, event: null })
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [slug])

  const currentRequest =
    eventRequest.slug === slug
      ? eventRequest
      : { status: null, event: null }

  if (currentRequest.status === null) {
    return (
      <RegistrationPageMessage
        loading
        title="Загружаем регистрацию"
        description="Получаем актуальный статус мероприятия."
      />
    )
  }

  if (currentRequest.status === EVENT_FETCH_STATUSES.NOT_FOUND) {
    return (
      <RegistrationPageMessage
        title="Событие не найдено"
        description="Проверьте ссылку или вернитесь на главную страницу 26.2 ROOM."
      />
    )
  }

  if (currentRequest.status === EVENT_FETCH_STATUSES.ERROR || !currentRequest.event) {
    return (
      <RegistrationPageMessage
        title="Не удалось загрузить регистрацию"
        description="Сейчас информация временно недоступна. Попробуйте открыть страницу позднее."
      />
    )
  }

  const event = currentRequest.event

  const eventDate = formatEventDate(event.startsAt)
  const eventPrice = formatPrice(event.price, event.currency)
  const gateContent = STATUS_GATE_CONTENT[event.status]
  const registrationIsOpen = event.status === EVENT_STATUSES.OPEN

  return (
    <div className="registrationPage">
      <RegistrationHeader event={event} />

      <main className="registrationPageMain">
        <section className="registrationPageIntro">
          <div className="registrationPageIntroCopy">
            <p className="registrationPageEyebrow">REGISTRATION · 26.2 ROOM</p>
            <h1>{event.title}</h1>
            {event.subtitle && <p className="registrationPageSubtitle">{event.subtitle}</p>}
          </div>

          <dl className="registrationPageMeta">
            {event.city && (
              <div>
                <dt>Город</dt>
                <dd>{event.city}</dd>
              </div>
            )}
            {eventDate && (
              <div>
                <dt>Дата</dt>
                <dd>{eventDate}</dd>
              </div>
            )}
            {event.venue && (
              <div>
                <dt>Место</dt>
                <dd>{event.venue}</dd>
              </div>
            )}
            {event.capacity && (
              <div>
                <dt>Лимит</dt>
                <dd>{event.capacity} участников</dd>
              </div>
            )}
            {eventPrice && (
              <div>
                <dt>Стоимость</dt>
                <dd>{eventPrice}</dd>
              </div>
            )}
          </dl>
        </section>

        {registrationIsOpen ? (
          event.eventType === 'kids_run' ? (
            <KidsRegistrationForm event={event} />
          ) : (
            <section className="registrationPageGate" aria-live="polite">
              <p className="registrationPageEyebrow">Регистрация</p>
              <h2>Форма регистрации готовится</h2>
              <p>Для этого формата события форма будет доступна позднее.</p>
              <Link className="registrationPagePrimaryLink" to={`/events/${event.slug}`}>
                Вернуться к мероприятию
              </Link>
            </section>
          )
        ) : (
          <section className="registrationPageGate" aria-live="polite">
            <p className="registrationPageEyebrow">Регистрация</p>
            <h2>{gateContent?.title ?? 'Регистрация недоступна'}</h2>
            <p>{gateContent?.description ?? 'Статус регистрации уточняется.'}</p>
            <Link className="registrationPagePrimaryLink" to={`/events/${event.slug}`}>
              Вернуться к мероприятию
            </Link>
          </section>
        )}
      </main>
    </div>
  )
}

export default RegistrationPage
