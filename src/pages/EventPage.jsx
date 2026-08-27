import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EVENT_FETCH_STATUSES, fetchEventBySlug } from '../api/events'
import './EventPage.css'

const EVENT_STATUSES = {
  DRAFT: 'draft',
  COMING_SOON: 'coming_soon',
  OPEN: 'open',
  SOLD_OUT: 'sold_out',
  CLOSED: 'closed',
  FINISHED: 'finished',
}

const EVENT_DATE_STATUSES = {
  TENTATIVE: 'tentative',
}

const EVENT_STATUS_LABELS = {
  [EVENT_STATUSES.DRAFT]: 'Событие готовится',
  [EVENT_STATUSES.COMING_SOON]: 'Регистрация скоро',
  [EVENT_STATUSES.OPEN]: 'Регистрация открыта',
  [EVENT_STATUSES.SOLD_OUT]: 'Все места заняты',
  [EVENT_STATUSES.CLOSED]: 'Регистрация завершена',
  [EVENT_STATUSES.FINISHED]: 'Мероприятие завершено',
}

const REGISTRATION_STATUS_COPY = {
  [EVENT_STATUSES.DRAFT]: 'Информация о мероприятии готовится. Регистрация будет доступна после утверждения деталей.',
  [EVENT_STATUSES.COMING_SOON]: 'Регистрация откроется после подтверждения даты.',
  [EVENT_STATUSES.OPEN]: 'Перейдите к форме участника, чтобы продолжить регистрацию.',
  [EVENT_STATUSES.SOLD_OUT]: 'Лимит участников на это мероприятие исчерпан.',
  [EVENT_STATUSES.CLOSED]: 'Регистрация на мероприятие завершена.',
  [EVENT_STATUSES.FINISHED]: 'Мероприятие уже завершено.',
}

function formatEventDate(value) {
  if (!value) {
    return null
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value)

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
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

function formatMinorPrice(priceMinor, currency) {
  if (priceMinor === null || priceMinor === undefined || typeof priceMinor !== 'number') {
    return null
  }

  return formatPrice(priceMinor / 100, currency)
}

function EventPageHeader() {
  return (
    <header className="eventPageHeader">
      <Link className="eventPageBrand" to="/">
        <img src="/logo-26-2room.jpg" alt="26.2 ROOM" />
        <span>26.2 ROOM</span>
      </Link>

      <Link className="eventPageBackLink" to="/">
        На главную
      </Link>
    </header>
  )
}

function EventPageMessage({ title, description, loading = false }) {
  return (
    <div className="eventPage">
      <EventPageHeader />

      <main
        className="eventPageNotFound eventPageMessage"
        aria-busy={loading}
        aria-live="polite"
      >
        {loading && <span className="eventPageLoader" aria-hidden="true" />}
        <p className="eventPageEyebrow">EVENTS</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {!loading && (
          <Link className="eventPagePrimaryLink" to="/">
            Вернуться на главную
          </Link>
        )}
      </main>
    </div>
  )
}

function EventPage() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const previewMode = searchParams.get('preview') === '1'
  const [eventRequest, setEventRequest] = useState({
    slug: null,
    preview: false,
    status: null,
    event: null,
  })
  const [failedVisualUrls, setFailedVisualUrls] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    fetchEventBySlug(slug, {
      signal: controller.signal,
      preview: previewMode,
    })
      .then((result) => {
        if (!isActive) {
          return
        }

        setEventRequest({
          slug,
          preview: previewMode,
          status: result.status,
          event: result.status === EVENT_FETCH_STATUSES.SUCCESS ? result.event : null,
        })
      })
      .catch((error) => {
        if (!isActive || error?.name === 'AbortError') {
          return
        }

        setEventRequest({
          slug,
          preview: previewMode,
          status: EVENT_FETCH_STATUSES.ERROR,
          event: null,
        })
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [previewMode, slug])

  const currentRequest =
    eventRequest.slug === slug && eventRequest.preview === previewMode
      ? eventRequest
      : { status: null, event: null }

  if (currentRequest.status === null) {
    return (
      <EventPageMessage
        loading
        title="Загружаем событие"
        description="Получаем актуальную информацию о старте."
      />
    )
  }

  if (currentRequest.status === EVENT_FETCH_STATUSES.NOT_FOUND) {
    return (
      <EventPageMessage
        title="Событие не найдено"
        description="Проверьте ссылку или вернитесь на главную страницу 26.2 ROOM."
      />
    )
  }

  if (currentRequest.status === EVENT_FETCH_STATUSES.ERROR) {
    return (
      <EventPageMessage
        title="Не удалось загрузить событие"
        description="Сейчас информация временно недоступна. Попробуйте открыть страницу позднее."
      />
    )
  }

  const event = currentRequest.event

  if (!event) {
    return (
      <EventPageMessage
        title="Не удалось загрузить событие"
        description="Сейчас информация временно недоступна. Попробуйте открыть страницу позднее."
      />
    )
  }

  const confirmedEventDate = formatEventDate(event.startsAt)
  const tentativeEventDate =
    event.dateStatus === EVENT_DATE_STATUSES.TENTATIVE
      ? formatEventDate(event.tentativeDate)
      : null
  const eventDate = confirmedEventDate ?? tentativeEventDate
  const eventDateIsTentative = !confirmedEventDate && Boolean(tentativeEventDate)
  const eventWindow =
    event.eventWindow?.start && event.eventWindow?.end
      ? `${event.eventWindow.start}–${event.eventWindow.end}`
      : null
  const eventPrice = formatMinorPrice(event.priceMinor, event.currency)
  const statusLabel = EVENT_STATUS_LABELS[event.status] ?? 'Статус уточняется'
  const registrationCopy = REGISTRATION_STATUS_COPY[event.status] ?? 'Информация о регистрации уточняется.'
  const hasDescription = Boolean(event.description?.trim())
  const hasDistances = event.distances.length > 0
  const hasStarterKit = event.starterKit.length > 0
  const hasPartners = event.partners.length > 0
  const eventVisualUrl = [event.posterUrl, event.coverImage].find(
    (url) => url && !failedVisualUrls.includes(url),
  )

  return (
    <div className="eventPage">
      <EventPageHeader />

      <main className="eventPageMain">
        {previewMode && (
          <div className="eventPagePreviewBanner" role="status">
            Режим предпросмотра — регистрация не будет создана.
          </div>
        )}

        <section className="eventPageHero">
          <div className="eventPageHeroCopy">
            <div className="eventPageStatus">{statusLabel}</div>
            <p className="eventPageEyebrow">{event.eventType}</p>
            <h1>{event.title}</h1>
            <p className="eventPageSubtitle">{event.subtitle}</p>
            <p className="eventPageLead">{event.shortDescription}</p>

            <div className="eventPageMeta">
              {event.city && (
                <div>
                  <span>Город</span>
                  <strong>{event.city}</strong>
                </div>
              )}

              {eventDate && (
                <div>
                  <span>Дата</span>
                  <strong>{eventDateIsTentative ? `Ориентировочно ${eventDate}` : eventDate}</strong>
                  {eventDateIsTentative && (
                    <small className="eventPageMetaNote">Точная дата уточняется</small>
                  )}
                </div>
              )}

              {eventWindow && (
                <div>
                  <span>Ориентировочное время</span>
                  <strong>{eventWindow}</strong>
                </div>
              )}

              {event.venue && (
                <div>
                  <span>Место</span>
                  <strong>{event.city ? `${event.venue}, ${event.city}` : event.venue}</strong>
                </div>
              )}

              {event.capacity && (
                <div>
                  <span>Лимит</span>
                  <strong>{event.capacity} участников</strong>
                </div>
              )}

              {eventPrice && (
                <div>
                  <span>Стоимость</span>
                  <strong>{eventPrice}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="eventPageVisual" aria-label={event.title}>
            {eventVisualUrl ? (
              <img
                src={eventVisualUrl}
                alt={`Постер ${event.title}`}
                onError={() =>
                  setFailedVisualUrls((currentUrls) => [
                    ...currentUrls,
                    eventVisualUrl,
                  ])
                }
              />
            ) : (
              <div className="eventPageVisualFallback">
                <span>26.2</span>
                <strong>ROOM</strong>
                <small>OWN EVENT</small>
              </div>
            )}
          </div>
        </section>

        {hasDescription && (
          <section className="eventPageSection">
            <p className="eventPageEyebrow">Описание</p>
            <h2>О событии</h2>
            <p>{event.description}</p>
          </section>
        )}

        {hasDistances && (
          <section className="eventPageSection">
            <p className="eventPageEyebrow">Дистанции</p>
            <h2>500 м или 1000 м</h2>
            <div className="eventPageSectionNotes">
              {event.participantNote && <p>{event.participantNote}</p>}
              {event.distanceSelectionNote && <p>{event.distanceSelectionNote}</p>}
            </div>
            <div className="eventPageGrid">
              {event.distances.map((distance) => (
                <article className="eventPageCard" key={distance.code}>
                  <h3>{distance.title}</h3>
                  {distance.distanceMeters && distance.title !== `${distance.distanceMeters} м` && (
                    <p>{distance.distanceMeters} м</p>
                  )}
                  {distance.capacity && <small>{distance.capacity} участников</small>}
                </article>
              ))}
            </div>
          </section>
        )}

        {hasStarterKit && (
          <section className="eventPageSection">
            <p className="eventPageEyebrow">Стартовый набор</p>
            <h2>Что входит в стартовый пакет</h2>
            <div className="eventPageGrid">
              {event.starterKit.map((item) => (
                <article className="eventPageCard" key={item.code}>
                  <span className="eventPageCardIndex">
                    {String(item.sortOrder).padStart(2, '0')}
                  </span>
                  <h3>{item.name}</h3>
                  {item.description && <p>{item.description}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {hasPartners && (
          <section className="eventPageSection">
            <p className="eventPageEyebrow">Партнёры</p>
            <h2>Кто поддерживает событие</h2>
            <div className="eventPageGrid">
              {event.partners.map((partner) => (
                <article className="eventPageCard" key={`${partner.name}-${partner.sortOrder}`}>
                  <h3>{partner.name}</h3>
                  {partner.category && <p>{partner.category}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="eventPageRegistration">
          <div>
            <p className="eventPageEyebrow">Регистрация</p>
            <h2>{statusLabel}</h2>
            <p>{registrationCopy}</p>
          </div>

          {(event.status === EVENT_STATUSES.OPEN || previewMode) && (
            <Link
              className="eventPagePrimaryLink"
              to={`/events/${event.slug}/register${previewMode ? '?preview=1' : ''}`}
            >
              {previewMode ? 'Предпросмотр формы' : 'Зарегистрироваться'}
            </Link>
          )}
        </section>
      </main>
    </div>
  )
}

export default EventPage
