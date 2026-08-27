import EventCard from './EventCard'
import './ActiveEvents.css'

function ActiveEvents({ events, loading = false, error = false }) {
  return (
    <section className="activeEvents">
      <div className="activeEventsHeader">
        <small>СОБЫТИЯ 26.2 ROOM</small>
        <h2>Ближайшие старты</h2>
        <p>
          Собственные мероприятия 26.2 ROOM: от детских стартов до больших
          городских событий и специальных форматов.
        </p>
      </div>

      {loading && (
        <div className="activeEventsState" aria-live="polite" role="status">
          <span className="activeEventsLoader" aria-hidden="true" />
          <strong>Загружаем ближайшие старты</strong>
          <p>Получаем актуальный список событий 26.2 ROOM.</p>
        </div>
      )}

      {error && (
        <div className="activeEventsState" aria-live="polite" role="status">
          <strong>События временно недоступны</strong>
          <p>Сейчас не удалось загрузить список стартов. Попробуйте открыть страницу позднее.</p>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="activeEventsState" aria-live="polite" role="status">
          <strong>Новые события скоро появятся</strong>
          <p>Следите за обновлениями календаря 26.2 ROOM.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="activeEventsGrid">
          {events.map((event) => (
            <EventCard event={event} key={event.slug} />
          ))}
        </div>
      )}
    </section>
  )
}

export default ActiveEvents
