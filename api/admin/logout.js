import {
  clearAdminSessionCookie,
} from '../_admin-auth.js'

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Type',
    'application/json; charset=utf-8',
  )

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  clearAdminSessionCookie(response)

  return response.status(200).json({
    authenticated: false,
  })
}