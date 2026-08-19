import {
  AdminAuthConfigurationError,
  isAdminRequest,
} from '../_admin-auth.js'

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Type',
    'application/json; charset=utf-8',
  )

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response
      .status(405)
      .json({ error: 'method_not_allowed' })
  }

  try {
    const authenticated = isAdminRequest(request)

    return response.status(200).json({
      authenticated,
    })
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      return response
        .status(503)
        .json({ error: 'admin_auth_unavailable' })
    }

    console.error('Admin session check failed:', error)

    return response
      .status(500)
      .json({ error: 'internal_error' })
  }
}