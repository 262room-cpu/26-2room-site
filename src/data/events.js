export const EVENT_STATUSES = {
  DRAFT: 'draft',
  COMING_SOON: 'coming_soon',
  OPEN: 'open',
  SOLD_OUT: 'sold_out',
  CLOSED: 'closed',
  FINISHED: 'finished',
}

export const events = [
  {
    id: 'kids-run-karaganda-2026',
    slug: 'kids-run-karaganda-2026',

    title: '26.2 ROOM Kids Run',
    subtitle: 'Детский забег 26.2 ROOM',

    eventType: 'kids_run',

    status: EVENT_STATUSES.DRAFT,

    shortDescription: 'Детский беговой старт 26.2 ROOM в Караганде.',
    description: '',

    city: 'Караганда',
    venue: '',
    address: '',

    startsAt: null,

    registrationOpensAt: null,
    registrationClosesAt: null,

    capacity: 500,

    price: null,
    currency: 'KZT',

    coverImage: null,

    distances: [],
    starterKit: [],
    partners: [],
  },
]

export function getEventBySlug(slug) {
  return events.find((event) => event.slug === slug) ?? null
}
