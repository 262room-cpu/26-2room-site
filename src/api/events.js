export const EVENT_FETCH_STATUSES = {
  SUCCESS: 'success',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
}

function adaptEventListItem(event) {
  if (
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event) ||
    (event.priceMinor !== null && typeof event.priceMinor !== 'number')
  ) {
    return null
  }

  return {
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    eventType: event.eventType,
    status: event.status,
    shortDescription: event.shortDescription,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    tentativeDate: event.tentativeDate,
    dateStatus: event.dateStatus,
    capacity: event.capacity,
    price: event.priceMinor === null ? null : event.priceMinor / 100,
    currency: event.currency,
  }
}

export async function fetchEvents({ signal } = {}) {
  try {
    const response = await fetch('/api/events', {
      headers: { Accept: 'application/json' },
      signal,
    })

    if (!response.ok) {
      return { status: EVENT_FETCH_STATUSES.ERROR }
    }

    const events = await response.json()

    if (!Array.isArray(events)) {
      return { status: EVENT_FETCH_STATUSES.ERROR }
    }

    const adaptedEvents = events.map(adaptEventListItem)

    if (adaptedEvents.some((event) => event === null)) {
      return { status: EVENT_FETCH_STATUSES.ERROR }
    }

    return { status: EVENT_FETCH_STATUSES.SUCCESS, events: adaptedEvents }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }

    return { status: EVENT_FETCH_STATUSES.ERROR }
  }
}

export async function fetchEventBySlug(slug, { signal } = {}) {
  if (typeof slug !== 'string' || slug.length === 0) {
    return { status: EVENT_FETCH_STATUSES.ERROR }
  }

  try {
    const response = await fetch(`/api/events?slug=${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal,
    })

    if (response.status === 404) {
      return { status: EVENT_FETCH_STATUSES.NOT_FOUND }
    }

    if (!response.ok) {
      return { status: EVENT_FETCH_STATUSES.ERROR }
    }

    const event = await response.json()

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { status: EVENT_FETCH_STATUSES.ERROR }
    }

    return { status: EVENT_FETCH_STATUSES.SUCCESS, event }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }

    return { status: EVENT_FETCH_STATUSES.ERROR }
  }
}
