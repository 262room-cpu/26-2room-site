import EventCard from './EventCard'
import './ActiveEvents.css'

function ActiveEvents({ events }) {
  if (events.length === 0) {
    return null
  }

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

      <div className="activeEventsGrid">
        {events.map((event) => (
          <EventCard event={event} key={event.id} />
        ))}
      </div>
    </section>
  )
}

export default ActiveEvents
