export const EVENT_STATUSES = {
  DRAFT: 'draft',
  COMING_SOON: 'coming_soon',
  OPEN: 'open',
  SOLD_OUT: 'sold_out',
  CLOSED: 'closed',
  FINISHED: 'finished',
}

export const EVENT_DATE_STATUSES = {
  TENTATIVE: 'tentative',
  CONFIRMED: 'confirmed',
}

export const events = [
  {
    id: 'kids-run-karaganda-2026',
    slug: 'kids-run-karaganda-2026',

    title: '26.2 ROOM Kids Run',
    subtitle: 'Детский забег 26.2 ROOM',

    eventType: 'kids_run',

    status: EVENT_STATUSES.COMING_SOON,

    shortDescription: 'Детский беговой старт 26.2 ROOM в Центральном парке Караганды. Две дистанции на выбор — 500 м и 1000 м.',
    description: '26.2 ROOM готовит детский беговой старт в Центральном парке Караганды. Участники младше 15 лет смогут выбрать одну из двух дистанций — 500 или 1000 метров. Планируется 500 участников. Точная дата мероприятия сейчас согласовывается.',

    city: 'Караганда',
    venue: 'Центральный парк',
    address: '',

    startsAt: null,
    dateStatus: EVENT_DATE_STATUSES.TENTATIVE,
    tentativeDate: '2026-09-14',
    eventWindow: {
      start: '08:00',
      end: '12:00',
    },

    registrationOpensAt: null,
    registrationClosesAt: null,

    capacity: 500,

    price: 9000,
    currency: 'KZT',

    coverImage: null,

    participantNote: 'Для детей до 15 лет.',
    distanceSelectionNote: 'Дистанцию участник выбирает самостоятельно независимо от возраста.',

    distances: [
      {
        id: '500m',
        title: '500 м',
        distanceMeters: 500,
        minAge: null,
        maxAge: 14,
        capacity: null,
        price: null,
      },
      {
        id: '1000m',
        title: '1000 м',
        distanceMeters: 1000,
        minAge: null,
        maxAge: 14,
        capacity: null,
        price: null,
      },
    ],
    starterKit: [
      {
        id: 'control-wristband',
        name: 'Контрольный браслет',
        description: '',
        image: null,
        sortOrder: 1,
      },
      {
        id: 'silicone-wristband',
        name: 'Силиконовый браслет 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 2,
      },
      {
        id: 'cap',
        name: 'Бейсболка 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 3,
      },
      {
        id: 'medal',
        name: 'Медаль 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 4,
      },
      {
        id: 'collectible-figure',
        name: 'Коллекционная фигурка 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 5,
      },
      {
        id: 'stationery-accessories',
        name: 'Набор аксессуаров для ручек / карандашей',
        description: '',
        image: null,
        sortOrder: 6,
      },
      {
        id: 'keychain',
        name: 'Брелок 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 7,
      },
      {
        id: 'lanyard',
        name: 'Лента 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 8,
      },
      {
        id: 'branded-bag',
        name: 'Фирменный пакет 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 9,
      },
      {
        id: 'stickers',
        name: 'Набор наклеек 26.2 ROOM',
        description: '',
        image: null,
        sortOrder: 10,
      },
    ],
    partners: [],
  },
]

const PUBLIC_EVENT_STATUSES = [
  EVENT_STATUSES.COMING_SOON,
  EVENT_STATUSES.OPEN,
  EVENT_STATUSES.SOLD_OUT,
  EVENT_STATUSES.CLOSED,
  EVENT_STATUSES.FINISHED,
]

const REGISTRATION_EVENT_STATUSES = [
  EVENT_STATUSES.COMING_SOON,
  EVENT_STATUSES.OPEN,
  EVENT_STATUSES.SOLD_OUT,
]

export function getEventBySlug(slug) {
  return events.find((event) => event.slug === slug) ?? null
}

export function getPublicEvents() {
  return events.filter((event) => PUBLIC_EVENT_STATUSES.includes(event.status))
}

export function getRegistrationEvents() {
  return events.filter((event) => REGISTRATION_EVENT_STATUSES.includes(event.status))
}
