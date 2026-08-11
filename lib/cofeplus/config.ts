export type CofeplusEnvironment = 'test' | 'live'

export const COFEPLUS_TEST_BASE_URL =
  'https://service-gate.test.cofeplus.com'

export const COFEPLUS_LIVE_BASE_URL = 'https://service-gate.cofeplus.com'

/** @deprecated Prefer COFEPLUS_TEST_BASE_URL / getCofeplusConfig(env).baseUrl */
export const COFEPLUS_DEFAULT_BASE_URL = COFEPLUS_TEST_BASE_URL

export const COFEPLUS_DOCS_URL = 'https://service-gate.cofeplus.com/docs'

export function getCofeplusBaseUrl(environment: CofeplusEnvironment) {
  if (environment === 'live') {
    return (
      process.env.COFEPLUS_LIVE_BASE_URL?.replace(/\/$/, '') ||
      COFEPLUS_LIVE_BASE_URL
    )
  }

  return (
    process.env.COFEPLUS_TEST_BASE_URL?.replace(/\/$/, '') ||
    process.env.COFEPLUS_BASE_URL?.replace(/\/$/, '') ||
    COFEPLUS_TEST_BASE_URL
  )
}

export function getCofeplusHmacSecret(environment: CofeplusEnvironment) {
  if (environment === 'live') {
    return process.env.COFEPLUS_LIVE_HMAC_SECRET || ''
  }

  return process.env.COFEPLUS_HMAC_SECRET || ''
}

export function getCofeplusConfig(environment: CofeplusEnvironment = 'test') {
  const kid = process.env.COFEPLUS_KID || 'client/v242kafei'

  return {
    environment,
    baseUrl: getCofeplusBaseUrl(environment),
    accessToken: process.env.COFEPLUS_ACCESS_TOKEN || '',
    hmacSecret: getCofeplusHmacSecret(environment),
    hasTestHmacSecret: Boolean(process.env.COFEPLUS_HMAC_SECRET),
    hasLiveHmacSecret: Boolean(process.env.COFEPLUS_LIVE_HMAC_SECRET),
    kid,
    issuer: process.env.COFEPLUS_ISS || 'cofeplus-test',
    subject: process.env.COFEPLUS_SUB || kid,
    audience: process.env.COFEPLUS_AUD || 'service-gate',
    scope: process.env.COFEPLUS_SCOPE || 'test',
  }
}
