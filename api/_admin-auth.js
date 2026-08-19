/* global process */
import {
  createHmac,
  createHash,
  timingSafeEqual,
} from 'node:crypto'

const ADMIN_COOKIE_NAME = 'room262_admin_session'
const SESSION_DURATION_SECONDS = 12 * 60 * 60
const SESSION_VERSION = 'v1'

export class AdminAuthConfigurationError extends Error {
  constructor() {
    super('Admin authentication configuration is unavailable')
    this.name = 'AdminAuthConfigurationError'
  }
}

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD?.trim()

  if (!password || password.length < 16) {
    throw new AdminAuthConfigurationError()
  }

  return password
}

function getAdminSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new AdminAuthConfigurationError()
  }

  return secret
}

function safeEqual(left, right) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string'
  ) {
    return false
  }

  const leftHash = createHash('sha256')
    .update(left, 'utf8')
    .digest()

  const rightHash = createHash('sha256')
    .update(right, 'utf8')
    .digest()

  return timingSafeEqual(leftHash, rightHash)
}

function signSession(expiresAt, secret) {
  return createHmac('sha256', secret)
    .update(
      `26.2-room-admin:${SESSION_VERSION}:${expiresAt}`,
      'utf8',
    )
    .digest('base64url')
}

function parseCookies(request) {
  const cookieHeader = request.headers?.cookie

  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {}
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')

      if (separatorIndex <= 0) {
        return cookies
      }

      const name = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()

      cookies[name] = value
      return cookies
    }, {})
}

function createSessionToken() {
  const secret = getAdminSessionSecret()
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    SESSION_DURATION_SECONDS

  const signature = signSession(expiresAt, secret)

  return `${SESSION_VERSION}.${expiresAt}.${signature}`
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')

  if (parts.length !== 3) {
    return false
  }

  const [version, expiresAtValue, signature] = parts

  if (version !== SESSION_VERSION) {
    return false
  }

  if (!/^\d+$/.test(expiresAtValue)) {
    return false
  }

  const expiresAt = Number(expiresAtValue)

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return false
  }

  const secret = getAdminSessionSecret()
  const expectedSignature = signSession(
    expiresAt,
    secret,
  )

  return safeEqual(signature, expectedSignature)
}

export function verifyAdminPassword(password) {
  if (typeof password !== 'string') {
    return false
  }

  return safeEqual(password, getAdminPassword())
}

export function isAdminRequest(request) {
  const cookies = parseCookies(request)
  const token = cookies[ADMIN_COOKIE_NAME]

  return verifySessionToken(token)
}

export function setAdminSessionCookie(response) {
  const token = createSessionToken()

  response.setHeader(
    'Set-Cookie',
    [
      `${ADMIN_COOKIE_NAME}=${token}`,
      'Path=/api/admin',
      `Max-Age=${SESSION_DURATION_SECONDS}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
    ].join('; '),
  )
}

export function clearAdminSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    [
      `${ADMIN_COOKIE_NAME}=`,
      'Path=/api/admin',
      'Max-Age=0',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
    ].join('; '),
  )
}