export const EVENT_FETCH_STATUSES = {
  SUCCESS: 'success',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
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
