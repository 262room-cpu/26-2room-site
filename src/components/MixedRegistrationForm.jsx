import { useState } from 'react'
import AdultRegistrationForm from './AdultRegistrationForm'
import KidsRegistrationForm from './KidsRegistrationForm'
import './MixedRegistrationForm.css'

const REGISTRATION_TYPES = [
  {
    value: 'kids',
    title: 'Детская регистрация',
    description: 'Регистрация ребёнка родителем или законным представителем.',
  },
  {
    value: 'participant',
    title: 'Взрослая регистрация',
    description: 'Самостоятельная регистрация участника от 18 лет.',
  },
]

function getTypeEvent(event, registrationFormType) {
  const groupIds = new Set(
    (event.registrationGroups ?? [])
      .filter(
        (group) =>
          group.registrationFormType === registrationFormType,
      )
      .map((group) => group.id),
  )

  return {
    ...event,
    registrationFormType,
    distances: (event.distances ?? []).filter((distance) =>
      groupIds.has(distance.groupId),
    ),
  }
}

function MixedRegistrationForm({ event, previewMode = false }) {
  const [selectedType, setSelectedType] = useState(null)

  if (selectedType) {
    const selectedEvent = getTypeEvent(event, selectedType)

    return (
      <div className="mixedRegistrationSelected">
        <button
          className="mixedRegistrationBack"
          type="button"
          onClick={() => setSelectedType(null)}
        >
          Изменить тип регистрации
        </button>

        {selectedEvent.distances.length === 0 ? (
          <section className="mixedRegistrationEmpty" role="status">
            <h2>Дистанции пока недоступны</h2>
            <p>
              Для выбранного типа регистрации ещё не настроены дистанции.
            </p>
          </section>
        ) : selectedType === 'kids' ? (
          <KidsRegistrationForm
            key="kids"
            event={selectedEvent}
            previewMode={previewMode}
          />
        ) : (
          <AdultRegistrationForm
            key="participant"
            event={selectedEvent}
            previewMode={previewMode}
          />
        )}
      </div>
    )
  }

  return (
    <section
      className="mixedRegistrationChooser"
      aria-labelledby="mixed-registration-title"
    >
      <p className="registrationPageEyebrow">Тип регистрации</p>
      <h2 id="mixed-registration-title">Кого регистрируем?</h2>
      <p>
        Выберите подходящий формат. Дистанции будут показаны для выбранной
        категории.
      </p>

      <div className="mixedRegistrationOptions">
        {REGISTRATION_TYPES.map((option) => {
          const typeEvent = getTypeEvent(event, option.value)
          const isAvailable = typeEvent.distances.length > 0

          return (
            <button
              type="button"
              key={option.value}
              onClick={() => setSelectedType(option.value)}
              disabled={!isAvailable}
            >
              <strong>{option.title}</strong>
              <span>{option.description}</span>
              <small>
                {isAvailable
                  ? `${typeEvent.distances.length} дистанций`
                  : 'Дистанции не настроены'}
              </small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default MixedRegistrationForm
