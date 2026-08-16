import { Link, useParams } from 'react-router'
import { EVENT_DATE_STATUSES, EVENT_STATUSES, getEventBySlug } from '../data/events'
import './EventPage.css'

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

function EventPage() {
  const { slug } = useParams()
  const event = getEventBySlug(slug)

  if (!event) {
    return (
      <div className="eventPage">
        <header className="eventPageHeader">
          <Link className="eventPageBrand" to="/">
            <img src="/logo-26-2room.jpg.jpg" alt="26.2 ROOM" />
            <span>26.2 ROOM</span>
          </Link>

          <Link className="eventPageBackLink" to="/">
            На главную
          </Link>
        </header>

        <main className="eventPageNotFound">
          <p className="eventPageEyebrow">EVENTS</p>
          <h1>Событие не найдено</h1>
          <p>
            Проверьте ссылку или вернитесь на главную страницу 26.2 ROOM.
          </p>
          <Link className="eventPagePrimaryLink" to="/">
            Вернуться на главную
          </Link>
        </main>
      </div>
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
  const eventPrice = formatPrice(event.price, event.currency)
  const statusLabel = EVENT_STATUS_LABELS[event.status] ?? 'Статус уточняется'
  const registrationCopy = REGISTRATION_STATUS_COPY[event.status] ?? 'Информация о регистрации уточняется.'
  const hasDescription = Boolean(event.description?.trim())
  const hasDistances = event.distances.length > 0
  const hasStarterKit = event.starterKit.length > 0
  const hasPartners = event.partners.length > 0

  return (
    <div className="eventPage">
      <header className="eventPageHeader">
        <Link className="eventPageBrand" to="/">
          <img src="/logo-26-2room.jpg.jpg" alt="26.2 ROOM" />
          <span>26.2 ROOM</span>
        </Link>

        <Link className="eventPageBackLink" to="/">
          На главную
        </Link>
      </header>

      <main className="eventPageMain">
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
            {event.coverImage ? (
              <img src={event.coverImage} alt={event.title} />
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
                <article className="eventPageCard" key={distance.id}>
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
                <article className="eventPageCard" key={item.id}>
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
                <article className="eventPageCard" key={partner.id}>
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

          {event.status === EVENT_STATUSES.OPEN && (
            <Link className="eventPagePrimaryLink" to={`/events/${event.slug}/register`}>
              Зарегистрироваться
            </Link>
          )}
        </section>
      </main>
    </div>
  )
}

export default EventPage
