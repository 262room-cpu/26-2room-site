import { useEffect, useState } from 'react'
import { EVENT_FETCH_STATUSES, fetchEvents } from '../api/events'
import ActiveEvents from '../components/ActiveEvents'
import {
  audiences,
  contactCards,
  organizerItems,
  races,
  sponsorItems,
} from '../data/homeContent'

const CONTACT_EMAIL = '26.2room@internet.ru'
const APP_SCREENSHOT_PATH = '/app-screenshot.png'

const START_SUBJECT = 'Добавить старт в 26.2 ROOM'
const PARTNERSHIP_SUBJECT = 'Партнёрство с 26.2 ROOM'

const startFormFields = [
  'Название старта',
  'Дата',
  'Город',
  'Страна',
  'Дистанции',
  'Ссылка на регистрацию',
  'Instagram организатора',
  'Контактное лицо',
  'Email или WhatsApp',
  'Комментарий',
]

const partnershipFormFields = [
  'Имя / компания',
  'Сфера деятельности',
  'Email или WhatsApp',
  'Что хотите обсудить',
  'Комментарий',
]

const startRequiredFields = ['Название старта', 'Дата', 'Город', 'Email или WhatsApp']
const partnershipRequiredFields = ['Имя / компания', 'Email или WhatsApp', 'Что хотите обсудить']

const fieldPlaceholders = {
  'Название старта': 'Например: Almaty Night Run',
  Дата: 'Например: 24.08.2026',
  Город: 'Алматы',
  Страна: 'Казахстан',
  Дистанции: '5K, 10K, 21.1K',
  'Ссылка на регистрацию': 'https://...',
  'Instagram организатора': '@organizer',
  'Контактное лицо': 'Имя и роль',
  'Email или WhatsApp': 'email или номер WhatsApp',
  Комментарий: 'Дополнительные детали',
  'Имя / компания': 'Имя или название бренда',
  'Сфера деятельности': 'Экипировка, питание, сервисы...',
  'Что хотите обсудить': 'Партнёрство, интеграция, спецпроект...',
}

function HomePage() {
  const [appScreenshotAvailable, setAppScreenshotAvailable] = useState(false)
  const [eventsRequest, setEventsRequest] = useState({
    status: null,
    events: [],
  })
  const [activeForm, setActiveForm] = useState(null)
  const [submissionStatus, setSubmissionStatus] = useState('idle')
  const [formAttempted, setFormAttempted] = useState(false)
  const [formValues, setFormValues] = useState({})

  useEffect(() => {
    const screenshot = new Image()

    screenshot.onload = () => setAppScreenshotAvailable(true)
    screenshot.src = APP_SCREENSHOT_PATH

    return () => {
      screenshot.onload = null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    fetchEvents({ signal: controller.signal })
      .then((result) => {
        if (!isActive) {
          return
        }

        setEventsRequest({
          status: result.status,
          events: result.status === EVENT_FETCH_STATUSES.SUCCESS ? result.events : [],
        })
      })
      .catch((error) => {
        if (!isActive || error?.name === 'AbortError') {
          return
        }

        setEventsRequest({ status: EVENT_FETCH_STATUSES.ERROR, events: [] })
      })

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  const openForm = (type) => {
    setActiveForm(type)
    setSubmissionStatus('idle')
    setFormAttempted(false)
    setFormValues({})
  }

  const closeForm = () => {
    setActiveForm(null)
    setSubmissionStatus('idle')
    setFormAttempted(false)
    setFormValues({})
  }

  const handleFormSubmit = async (event) => {
    event.preventDefault()
    setFormAttempted(true)

    if (missingRequiredFields.length > 0) {
      setSubmissionStatus('idle')
      return
    }

    setSubmissionStatus('sending')

    const fields = currentForm.fields.reduce((formFields, field) => {
      formFields[field] = formValues[field]?.trim() || ''
      return formFields
    }, {})

    const type = activeForm === 'start' ? 'race' : 'partner'

    try {
      const response = await fetch('/api/send-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          fields,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || result?.ok !== true) {
        console.error('API error:', result)
        console.error('Failed to send request to /api/send-request', {
          status: response.status,
          statusText: response.statusText,
        })
        throw new Error('Request failed')
      }

      setSubmissionStatus('success')
    } catch (error) {
      console.error('Request to /api/send-request failed', error)
      setSubmissionStatus('error')
    }
  }

  const handleFieldChange = (field, value) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setSubmissionStatus('idle')
  }

  const currentForm =
    activeForm === 'start'
      ? {
          title: START_SUBJECT,
          fields: startFormFields,
          requiredFields: startRequiredFields,
          submitLabel: 'Отправить заявку',
        }
      : {
          title: PARTNERSHIP_SUBJECT,
          fields: partnershipFormFields,
          requiredFields: partnershipRequiredFields,
          submitLabel: 'Обсудить партнёрство',
        }

  const missingRequiredFields = currentForm.requiredFields.filter(
    (field) => !formValues[field]?.trim(),
  )
  const hasEmptyRequiredFields = missingRequiredFields.length > 0
  const isSending = submissionStatus === 'sending'

  return (
    <div className="page">
      <header className="header">
        <div className="logoBox">
          <img className="logoImage" src="/logo-26-2room.jpg" alt="26.2 ROOM" />
          <div className="brandCopy">
            <div className="logoText" data-text="26.2 ROOM">26.2 ROOM</div>
            <div className="tagline">YOUR FINISH LINE</div>
          </div>
        </div>

        <nav className="nav">
          <a href="#audiences">Для кого</a>
          <a href="#app">Приложение</a>
          <a href="#organizers">Организаторам</a>
          <a href="#partners">Брендам</a>
          <a href="#instagram">Instagram</a>
          <a href="#contacts">Контакты</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="heroText">
            <div className="badge">Сайт · Instagram · App</div>

            <h1>
              Беговая экосистема для стартов, людей и брендов.
            </h1>

            <p>
              26.2 ROOM объединяет бегунов, организаторов, клубы и бренды
              через сайт, Instagram-медиа и приложение.
            </p>

            <div className="buttons">
              <button className="primaryBtn" type="button" onClick={() => openForm('start')}>
                Добавить старт
              </button>
              <button className="secondaryBtn" type="button" onClick={() => openForm('partnership')}>
                Стать партнёром
              </button>
              <a className="secondaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
                Instagram
              </a>
            </div>

            <div className="stats">
              <div>
                <b>Бегуны</b>
                <small>ищут старты и идеи</small>
              </div>
              <div>
                <b>Организаторы</b>
                <small>получают аудиторию</small>
              </div>
              <div>
                <b>Бренды</b>
                <small>входят в комьюнити</small>
              </div>
            </div>
          </div>

          <div className="phoneWrap">
            <div className="phone">
              <img className="phoneLogoWatermark" src="/logo-26-2room.jpg" alt="" aria-hidden="true" />
              <div className="phoneTop">
                <div>
                  <small>26.2 ROOM</small>
                  <h3>Календарь стартов</h3>
                </div>
                <div className="roundIcon">26</div>
              </div>

              <div className="featuredRace">
                <small>Экосистема</small>
                <h3>Сайт + Instagram + App</h3>
                <p>Анонсы · медиа · регистрация</p>
              </div>

              <div className="raceList">
                {races.map((race) => (
                  <div className="raceCard" key={race.name}>
                    <div>
                      <b>{race.name}</b>
                      <small>{race.city}</small>
                    </div>
                    <strong>{race.date}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ActiveEvents
          events={eventsRequest.events}
          loading={eventsRequest.status === null}
          error={eventsRequest.status === EVENT_FETCH_STATUSES.ERROR}
        />

        <section className="section audienceSection" id="audiences">
          <div className="sectionTitle">
            <small>ЧТО ТАКОЕ 26.2 ROOM?</small>
            <h2>Всё нужное для движения вперёд.</h2>
            <p>
              Календарь событий, живое медиа и рабочая точка связи для
              сообщества и индустрии.
            </p>
          </div>

          <div className="audienceGrid">
            {audiences.map((item) => (
              <div className="audienceCard" key={item.title}>
                <span>{item.title}</span>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className={`appStatus${appScreenshotAvailable ? ' hasScreenshot' : ''}`}
          id="app"
        >
          <div className="appStatusCopy">
            <div className="statusBadge">App Store · Google Play</div>
            <h2>Приложение 26.2 ROOM уже доступно</h2>
            <p>
              Находите спортивные старты, сохраняйте интересные события и
              планируйте следующий старт в одном приложении.
            </p>
            <a
              className="primaryBtn"
              href="https://onelink.to/ggt8eg"
              target="_blank"
              rel="noreferrer"
            >
              Скачать приложение
            </a>
          </div>

          {appScreenshotAvailable && (
            <div className="appStatusMedia">
              <img
                src={APP_SCREENSHOT_PATH}
                alt="Приложение 26.2 ROOM"
              />
            </div>
          )}
        </section>

        <section className="businessSection" id="organizers">
          <div className="businessText">
            <small>ДЛЯ ОРГАНИЗАТОРОВ</small>
            <h2>Ваше событие увидит нужная аудитория.</h2>
            <p>
              Добавьте марафон, трейл, городскую или клубную пробежку: разместим
              информацию и направим участников на официальную регистрацию.
            </p>
            <button className="primaryBtn" type="button" onClick={() => openForm('start')}>
              Добавить свой старт
            </button>
          </div>

          <div className="checkCard">
            {organizerItems.map((item) => (
              <div className="checkItem" key={item}>
                <span>+</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="businessSection reverse" id="partners">
          <div className="businessText">
            <small>ДЛЯ СПОНСОРОВ И БРЕНДОВ</small>
            <h2>Свяжите бренд с активной аудиторией.</h2>
            <p>
              Партнёрские форматы, спецпроекты и интеграции вокруг календаря и
              спортивных событий Казахстана.
            </p>
            <button className="primaryBtn" type="button" onClick={() => openForm('partnership')}>
              Обсудить партнёрство
            </button>
          </div>

          <div className="checkCard yellowCard">
            {sponsorItems.map((item) => (
              <div className="checkItem" key={item}>
                <span>+</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mediaSection" id="instagram">
          <div>
            <small>INSTAGRAM-МЕДИА</small>
            <h2>@26.2_room — медиа в ритме бега.</h2>
            <p>
              Афиши, подборки, рилсы, календарь и живой контент сообщества.
            </p>
          </div>

          <a className="primaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
            Открыть @26.2_room
          </a>
        </section>

        <section className="contactHub" id="contacts">
          <div className="contactHubTitle">
            <small>КОНТАКТЫ ДЛЯ ОРГАНИЗАТОРОВ И БРЕНДОВ</small>
            <h2>Хотите попасть в 26.2 ROOM?</h2>
            <p>
              Добавьте свой старт, предложите партнёрство или обсудите
              интеграцию с беговым комьюнити.
            </p>
          </div>

          <div className="contactCards">
            {contactCards.map((card) => (
              <article className="contactCard" key={card.title}>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </div>

                <ul>
                  {card.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <button className="primaryBtn" type="button" onClick={() => openForm(card.formType)}>
                  {card.button}
                </button>
              </article>
            ))}
          </div>

          <div className="contactHubActions">
            <a className="secondaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a className="secondaryBtn" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div>© 2026 26.2 ROOM. Running ecosystem.</div>
        <div className="footerLinks">
          <a href="#audiences">О проекте</a>
          <a href="#app">Приложение</a>
          <a href="#organizers">Организаторам</a>
          <a href="#contacts">Контакты</a>
        </div>
      </footer>

      {activeForm && (
        <div className="formOverlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="formModal">
            <button className="modalClose" type="button" onClick={closeForm} aria-label="Закрыть форму">
              ×
            </button>

            <div className="modalHeader">
              <small>26.2 ROOM</small>
              <h2 id="modal-title">{currentForm.title}</h2>
              <p>
                Заполните форму, и мы получим заявку на почту 26.2 ROOM.
                Для срочной связи: {CONTACT_EMAIL}
              </p>
            </div>

            <form className="requestForm" onSubmit={handleFormSubmit}>
              <div className="formGrid">
                {currentForm.fields.map((field) => {
                  const isRequired = currentForm.requiredFields.includes(field)
                  const isInvalid = formAttempted && isRequired && !formValues[field]?.trim()
                  const isWide = field === 'Комментарий' || field === 'Что хотите обсудить'

                  return (
                    <label className={`${isWide ? 'wideField' : ''} ${isInvalid ? 'invalidField' : ''}`} key={field}>
                      <span>
                        {field}
                        {isRequired && <b>*</b>}
                      </span>
                    {field === 'Комментарий' || field === 'Что хотите обсудить' ? (
                      <textarea
                        rows="4"
                        value={formValues[field] || ''}
                        placeholder={fieldPlaceholders[field]}
                        onChange={(event) => handleFieldChange(field, event.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        value={formValues[field] || ''}
                        placeholder={fieldPlaceholders[field]}
                        onChange={(event) => handleFieldChange(field, event.target.value)}
                      />
                    )}
                    </label>
                  )
                })}
              </div>

              {formAttempted && hasEmptyRequiredFields && (
                <div className="formError">
                  Заполните обязательные поля, чтобы мы могли связаться с вами.
                </div>
              )}

              {submissionStatus === 'success' && (
                <div className="formNotice">
                  Заявка отправлена. Мы свяжемся с вами.
                </div>
              )}

              {submissionStatus === 'error' && (
                <div className="formError">
                  Не удалось отправить заявку. Напишите нам напрямую:
                  {' '}
                  {CONTACT_EMAIL}
                </div>
              )}

              <div className="formFootnote">
                Для срочной связи:
                {' '}
                {CONTACT_EMAIL}
              </div>

              <button className={`primaryBtn ${hasEmptyRequiredFields ? 'softDisabledBtn' : ''}`} type="submit" disabled={isSending}>
                {isSending ? 'Отправляем...' : currentForm.submitLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
