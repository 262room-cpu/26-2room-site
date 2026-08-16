import { Link, useParams } from 'react-router'
import { EVENT_STATUSES, getEventBySlug } from '../data/events'
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
  [EVENT_STATUSES.COMING_SOON]: 'Регистрация скоро откроется. Следите за обновлениями 26.2 ROOM.',
  [EVENT_STATUSES.OPEN]: 'Регистрация будет подключена на следующем этапе.',
  [EVENT_STATUSES.SOLD_OUT]: 'Лимит участников на это мероприятие исчерпан.',
  [EVENT_STATUSES.CLOSED]: 'Регистрация на мероприятие завершена.',
  [EVENT_STATUSES.FINISHED]: 'Мероприятие уже завершено.',
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

  const eventDate = formatEventDate(event.startsAt)
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
                  <strong>{eventDate}</strong>
                </div>
              )}

              {event.venue && (
                <div>
                  <span>Место</span>
                  <strong>{event.venue}</strong>
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
            <h2>Форматы участия</h2>
            <div className="eventPageGrid">
              {event.distances.map((distance) => (
                <article className="eventPageCard" key={distance.id}>
                  <h3>{distance.title}</h3>
                  {distance.distanceMeters && <p>{distance.distanceMeters} м</p>}
                  {distance.capacity && <small>{distance.capacity} участников</small>}
                </article>
              ))}
            </div>
          </section>
        )}

        {hasStarterKit && (
          <section className="eventPageSection">
            <p className="eventPageEyebrow">Стартовый набор</p>
            <h2>Что получает участник</h2>
            <div className="eventPageGrid">
              {event.starterKit.map((item) => (
                <article className="eventPageCard" key={item.id}>
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
        </section>
      </main>
    </div>
  )
}

export default EventPage
