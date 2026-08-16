import { useState } from 'react'
import './App.css'
import {
  audiences,
  contactCards,
  ecosystem,
  organizerItems,
  platformCards,
  races,
  reasons,
  sponsorItems,
} from './data/homeContent'

const CONTACT_EMAIL = '26.2room@internet.ru'

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

function App() {
  const [activeForm, setActiveForm] = useState(null)
  const [submissionStatus, setSubmissionStatus] = useState('idle')
  const [formAttempted, setFormAttempted] = useState(false)
  const [formValues, setFormValues] = useState({})

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
      console.log('Sending request to /api/send-request', { type, fields })

      const response = await fetch('/api/send-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          fields,
        }),
      })
      const result = await response.json().catch(() => null)

      console.log('API response:', result)

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
          <img className="logoImage" src="/logo-26-2room.jpg.jpg" alt="26.2 ROOM" />
          <div className="brandCopy">
            <div className="logoText" data-text="26.2 ROOM">26.2 ROOM</div>
            <div className="tagline">YOUR FINISH LINE</div>
          </div>
        </div>

        <nav className="nav">
          <a href="#audiences">Для кого</a>
          <a href="#ecosystem">Экосистема</a>
          <a href="#runners">Бегунам</a>
          <a href="#organizers">Организаторам</a>
          <a href="#partners">Брендам</a>
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
              через сайт, Instagram-медиа и будущее приложение.
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
              <img className="phoneLogoWatermark" src="/logo-26-2room.jpg.jpg" alt="" aria-hidden="true" />
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

        <section className="section audienceSection" id="audiences">
          <div className="sectionTitle">
            <small>ЧТО ТАКОЕ 26.2 ROOM?</small>
            <h2>Единое пространство для беговой культуры.</h2>
            <p>
              Это единое пространство для беговой культуры: мы собираем
              старты, рассказываем о событиях, создаём медиа-контент и строим
              цифровую платформу для бегунов и организаторов.
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

        <section className="whySection">
          <div className="whyIntro">
            <small>ПОЧЕМУ 26.2 ROOM?</small>
            <h2>Почему 26.2 ROOM?</h2>
            <p className="whyLead">
              Беговая аудитория уже есть — ей нужно удобное место, где видны
              старты, клубы, организаторы и бренды.
            </p>
            <p>
              Мы соединяем календарь стартов, Instagram-медиа, беговое
              комьюнити, будущую app-платформу и партнёрские интеграции в одну
              экосистему.
            </p>
          </div>

          <div className="whyGrid">
            {reasons.map((reason) => (
              <article className="whyCard" key={reason.title}>
                <span>{reason.number}</span>
                <h3>{reason.title}</h3>
                <p>{reason.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="platformSection">
          <div className="platformIntro">
            <small>САЙТ И БУДУЩЕЕ ПРИЛОЖЕНИЕ</small>
            <h2>Сайт показывает главное. Приложение откроет всё.</h2>
            <p>
              На сайте мы рассказываем о проекте, показываем избранные старты и
              собираем заявки от организаторов и партнёров. Полный календарь,
              фильтры, карта, избранное и уведомления будут доступны в
              приложении 26.2 ROOM.
            </p>
          </div>

          <div className="platformCards">
            {platformCards.map((card) => (
              <article className={`platformCard ${card.highlight ? 'platformCardHot' : ''}`} key={card.title}>
                <div className="platformCardTop">
                  <h3>{card.title}</h3>
                  {card.badge && <span>{card.badge}</span>}
                </div>

                <ul>
                  {card.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="ecosystem">
          <div className="sectionTitle">
            <small>ЭКОСИСТЕМА</small>
            <h2>App, сайт и Instagram работают вместе.</h2>
            <p>
              Мы собираем старты, людей, организаторов и бренды в понятную
              цифровую систему: от медиа-анонса до перехода на регистрацию.
            </p>
          </div>

          <div className="featuresGrid ecosystemGrid">
            {ecosystem.map((item) => (
              <div className="featureCard" key={item.title}>
                <div className="featureIcon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section startsSection" id="runners">
          <div>
            <small>ДЛЯ БЕГУНОВ</small>
            <h2>Находить старты проще. Планировать сезон спокойнее.</h2>
            <p>
              Бегуны смогут находить старты, следить за календарём, сохранять
              идеи для сезона и подписываться на Instagram, чтобы не пропускать
              афиши, подборки и живой беговой контент.
            </p>

            <div className="tags">
              <span>5K</span>
              <span>10K</span>
              <span>21.1K</span>
              <span>42.2K</span>
              <span>Trail</span>
              <span>Club Run</span>
            </div>
          </div>

          <div className="bigRaceList">
            {races.map((race) => (
              <div className="bigRaceCard" key={race.name}>
                <div>
                  <small>{race.city}</small>
                  <h3>{race.name}</h3>
                </div>
                <strong>{race.date}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="businessSection" id="organizers">
          <div className="businessText">
            <small>ДЛЯ ОРГАНИЗАТОРОВ</small>
            <h2>Расскажите о старте тем, кто уже ищет, куда бежать.</h2>
            <p>
              Организуете марафон, трейл, забег, клубную пробежку или
              спортивное событие? 26.2 ROOM поможет рассказать о вашем старте
              беговой аудитории.
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
            <h2>Точка входа в беговое комьюнити Казахстана.</h2>
            <p>
              26.2 ROOM — точка входа в беговое комьюнити Казахстана. Мы
              создаём медиа, календарь стартов и цифровую платформу, вокруг
              которой собирается активная спортивная аудитория.
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
            <h2>@26.2_room — живая часть экосистемы.</h2>
            <p>
              В Instagram мы публикуем календарь стартов, беговые мемы, афиши,
              подборки, рилсы и живой контент для бегунов.
            </p>
          </div>

          <a className="primaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
            Открыть @26.2_room
          </a>
        </section>

        <section className="appStatus">
          <div className="statusBadge">Приложение в разработке</div>
          <h2>Готовим приложение для поиска стартов.</h2>
          <p>
            Мы готовим приложение, где бегуны смогут искать старты по дате,
            городу, дистанции, сохранять события и получать напоминания.
          </p>
        </section>

        <section className="finalCta" id="contacts">
          <div className="arrow">→</div>
          <h2>Хотите добавить старт, предложить партнёрство или обсудить интеграцию?</h2>

          <div className="buttons center">
            <button className="primaryBtn" type="button" onClick={() => openForm('start')}>
              Добавить старт
            </button>
            <button className="secondaryBtn" type="button" onClick={() => openForm('partnership')}>
              Стать партнёром
            </button>
            <a className="secondaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <button className="secondaryBtn" type="button" onClick={() => openForm('partnership')}>
              Email
            </button>
          </div>

          <div className="email">26.2room@internet.ru</div>
        </section>

        <section className="contactHub">
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
        </section>
      </main>

      <footer className="footer">
        <div>© 2026 26.2 ROOM. Running ecosystem.</div>
        <div className="footerLinks">
          <a href="#ecosystem">Экосистема</a>
          <a href="#organizers">Организаторам</a>
          <button type="button" onClick={() => openForm('partnership')}>Contact</button>
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

export default App
