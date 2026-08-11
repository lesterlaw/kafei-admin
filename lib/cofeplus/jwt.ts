import { createHmac } from 'crypto'
import {
  getCofeplusConfig,
  type CofeplusEnvironment,
} from './config'

function base64UrlEncode(input: Buffer | string) {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export interface CofeplusJwtClaims {
  iss: string
  sub: string
  aud: string
  scope: string
  iat: number
  exp: number
}

export interface GenerateCofeplusJwtResult {
  token: string
  header: {
    alg: 'HS256'
    typ: 'JWT'
    kid: string
  }
  payload: CofeplusJwtClaims
  environment: CofeplusEnvironment
}

/**
 * COFEPLUS service-gate expects HS256 with the HMAC secret as the UTF-8
 * hex string (not raw hex-decoded bytes), and `kid` / `sub` set to the client id.
 * Test and live use different HMAC secrets; kid stays the same.
 */
export function generateCofeplusJwt(
  expiresInSeconds = 3600,
  environment: CofeplusEnvironment = 'test'
): GenerateCofeplusJwtResult {
  const config = getCofeplusConfig(environment)

  if (!config.hmacSecret) {
    throw new Error(
      environment === 'live'
        ? 'COFEPLUS_LIVE_HMAC_SECRET is not configured'
        : 'COFEPLUS_HMAC_SECRET is not configured'
    )
  }
  if (!config.kid) {
    throw new Error('COFEPLUS_KID is not configured')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'HS256' as const,
    typ: 'JWT' as const,
    kid: config.kid,
  }
  const payload: CofeplusJwtClaims = {
    iss: config.issuer,
    sub: config.subject || config.kid,
    aud: config.audience,
    scope: config.scope,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', config.hmacSecret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return {
    token: `${signingInput}.${signature}`,
    header,
    payload,
    environment,
  }
}
