import { RegistrationFlowError } from './registration.js'

async function readJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function postJson(
  url,
  body,
  { headers = {}, signal } = {},
) {
  let response

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    throw new RegistrationFlowError('network_error')
  }

  const data = await readJsonResponse(response)

  if (!response.ok) {
    throw new RegistrationFlowError(
      data?.error ?? 'request_failed',
      response.status,
    )
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new RegistrationFlowError(
      'invalid_server_response',
      response.status,
    )
  }

  return data
}

export async function reserveAdultRegistration(
  {
    eventSlug,
    distanceCode,
    participant,
    consents,
    idempotencyKey,
  },
  { signal } = {},
) {
  return postJson(
    '/api/registrations/adult-reserve',
    {
      eventSlug,
      distanceCode,
      participant,
      consents,
    },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      signal,
    },
  )
}
