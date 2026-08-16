import { Link } from 'react-router'
import { EVENT_STATUSES } from '../data/events'

const EVENT_STATUS_LABELS = {
  [EVENT_STATUSES.COMING_SOON]: 'Регистрация скоро',
  [EVENT_STATUSES.OPEN]: 'Регистрация открыта',
  [EVENT_STATUSES.SOLD_OUT]: 'Все места заняты',
  [EVENT_STATUSES.CLOSED]: 'Регистрация завершена',
  [EVENT_STATUSES.FINISHED]: 'Мероприятие завершено',
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
    maximumFractionDigits: 0,
  }).format(price)
}

function EventCard({ event }) {
  const eventDate = formatEventDate(event.startsAt)
  const eventPrice = formatPrice(event.price, event.currency)
  const statusLabel = EVENT_STATUS_LABELS[event.status] ?? 'Статус уточняется'

  return (
    <article className="activeEventCard">
      <div className="activeEventCardTop">
        <span className="activeEventCardStatus">{statusLabel}</span>
        {event.eventType && <small>{event.eventType}</small>}
      </div>

      <h3>{event.title}</h3>
      {event.subtitle && <p className="activeEventCardSubtitle">{event.subtitle}</p>}
      {event.shortDescription && <p className="activeEventCardDescription">{event.shortDescription}</p>}

      <div className="activeEventCardMeta">
        {event.city && (
          <div>
            <span>Город</span>
            <strong>{event.city}</strong>
          </div>
        )}

        {event.venue && (
          <div>
            <span>Место</span>
            <strong>{event.venue}</strong>
          </div>
        )}

        {eventDate && (
          <div>
            <span>Дата</span>
            <strong>{eventDate}</strong>
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

      <Link className="activeEventCardAction" to={`/events/${event.slug}`}>
        Подробнее
      </Link>
    </article>
  )
}

export default EventCard
