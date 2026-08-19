import {
  AdminAuthConfigurationError,
  setAdminSessionCookie,
  verifyAdminPassword,
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

  const password = request.body?.password

  try {
    if (!verifyAdminPassword(password)) {
      return response
        .status(401)
        .json({ error: 'invalid_credentials' })
    }

    setAdminSessionCookie(response)

    return response.status(200).json({
      authenticated: true,
    })
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      return response
        .status(503)
        .json({ error: 'admin_auth_unavailable' })
    }

    console.error('Admin login failed:', error)

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }
}