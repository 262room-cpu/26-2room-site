import './App.css'

const CONTACT_EMAIL = '26.2room@internet.ru'
const CC_EMAILS = 'oleg_191090@mail.ru'

const createMailto = (subject) =>
  `mailto:${CONTACT_EMAIL}?cc=${CC_EMAILS}&subject=${encodeURIComponent(subject)}`

const START_SUBJECT = 'Добавить старт в 26.2 ROOM'
const PARTNERSHIP_SUBJECT = 'Партнёрство с 26.2 ROOM'
const GENERAL_SUBJECT = 'Обращение с сайта 26.2 ROOM'

function App() {
  const races = [
    { date: '03.05', name: 'Atyrau Run', city: 'Атырау' },
    { date: '07.05', name: 'Alaman Run', city: 'Алматы' },
    { date: '10.05', name: 'Caspian Marathon', city: 'Актау' },
    { date: '23.05', name: 'MNU Marathon', city: 'Астана' },
  ]

  const audiences = [
    {
      title: 'Бегунам',
      text: 'Находить старты, следить за календарём и выбирать следующий забег.',
    },
    {
      title: 'Организаторам',
      text: 'Добавлять события, получать охват и вести участников на регистрацию.',
    },
    {
      title: 'Брендам',
      text: 'Интегрироваться в активную спортивную аудиторию через медиа и партнёрства.',
    },
  ]

  const ecosystem = [
    {
      icon: 'APP',
      title: 'App',
      text: 'Будущее приложение для поиска стартов, избранного, фильтров и напоминаний.',
    },
    {
      icon: 'SITE',
      title: 'Site',
      text: 'Официальная витрина проекта, заявки от организаторов, партнёров и спонсоров.',
    },
    {
      icon: 'IG',
      title: 'Instagram',
      text: 'Медиа, мемы, афиши, календарь стартов, рилсы и живое комьюнити.',
    },
  ]

  const reasons = [
    {
      number: '01',
      title: 'Видимость',
      text: 'Помогаем стартам и брендам стать заметнее в беговой среде.',
    },
    {
      number: '02',
      title: 'Доверие',
      text: 'Официальная витрина проекта вместо разрозненных постов, сторис и случайных анонсов.',
    },
    {
      number: '03',
      title: 'Контент',
      text: 'Создаём визуалы, афиши, мемы, рилсы и понятную подачу для бегового сообщества.',
    },
    {
      number: '04',
      title: 'Рост',
      text: 'Строим платформу, которая может масштабироваться за пределы Казахстана.',
    },
  ]

  const platformCards = [
    {
      title: 'На сайте',
      items: [
        'о проекте и экосистеме',
        'избранные старты и анонсы',
        'заявки от организаторов',
        'партнёрства и спонсорство',
        'переход в Instagram',
      ],
    },
    {
      title: 'В приложении',
      badge: 'Coming soon',
      highlight: true,
      items: [
        'полный календарь стартов',
        'фильтры по городу, дате и дистанции',
        'избранное',
        'уведомления',
        'карта стартов',
        'личный календарь бегуна',
      ],
    },
  ]

  const organizerItems = [
    'добавить событие на сайт',
    'попасть в календарь стартов',
    'получить публикацию в Instagram',
    'сделать партнёрский визуал',
    'вести людей на официальную регистрацию',
  ]

  const sponsorItems = [
    'партнёрство',
    'спецпроекты',
    'нативные интеграции',
    'спонсорство календаря',
    'коллаборации с забегами',
  ]

  const contactCards = [
    {
      title: 'Добавить старт',
      text: 'Для марафонов, трейлов, городских забегов, клубных пробежек и спортивных событий.',
      items: ['дата и город', 'дистанции', 'ссылка на регистрацию', 'Instagram или сайт организатора'],
      button: 'Отправить старт',
      href: createMailto(START_SUBJECT),
    },
    {
      title: 'Стать партнёром',
      text: 'Для брендов, спонсоров, спортивных магазинов, экипировки, питания, сервисов и компаний.',
      items: ['спецпроект', 'интеграция в Instagram', 'спонсорство календаря', 'коллаборация с забегами'],
      button: 'Обсудить партнёрство',
      href: createMailto(PARTNERSHIP_SUBJECT),
    },
  ]

  return (
    <div className="page">
      <header className="header">
        <div className="logoBox">
          <img className="logoImage" src="/logo-26-2room.jpg.jpg" alt="26.2 ROOM" />
          <div className="brandCopy">
            <div className="logoText">26.2 ROOM</div>
            <div className="tagline">your finish line</div>
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
              <a className="primaryBtn" href={createMailto(START_SUBJECT)}>
                Добавить старт
              </a>
              <a className="secondaryBtn" href={createMailto(PARTNERSHIP_SUBJECT)}>
                Стать партнёром
              </a>
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
            <a className="primaryBtn" href={createMailto(START_SUBJECT)}>
              Добавить свой старт
            </a>
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
            <a className="primaryBtn" href={createMailto(PARTNERSHIP_SUBJECT)}>
              Обсудить партнёрство
            </a>
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
            <a className="primaryBtn" href={createMailto(START_SUBJECT)}>
              Добавить старт
            </a>
            <a className="secondaryBtn" href={createMailto(PARTNERSHIP_SUBJECT)}>
              Стать партнёром
            </a>
            <a className="secondaryBtn" href="https://www.instagram.com/26.2_room/" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a className="secondaryBtn" href={createMailto(GENERAL_SUBJECT)}>
              Email
            </a>
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

                <a className="primaryBtn" href={card.href}>
                  {card.button}
                </a>
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
          <a href={createMailto(GENERAL_SUBJECT)}>Contact</a>
        </div>
      </footer>
    </div>
  )
}

export default App
