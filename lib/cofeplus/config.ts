export type CofeplusEnvironment = 'test' | 'live'

export const COFEPLUS_TEST_BASE_URL =
  'https://service-gate.test.cofeplus.com'

export const COFEPLUS_LIVE_BASE_URL = 'https://service-gate.cofeplus.com'

/** @deprecated Prefer COFEPLUS_TEST_BASE_URL / getCofeplusConfig(env).baseUrl */
export const COFEPLUS_DEFAULT_BASE_URL = COFEPLUS_TEST_BASE_URL

export const COFEPLUS_DOCS_URL = 'https://service-gate.cofeplus.com/docs'

/** Demo / test machine. Live partner tokens get POD_ACCESS_DENIED on this pod. */
export const COFEPLUS_TEST_POD_ID = 'RCK111'
/** Production machine. Test partner tokens get POD_ACCESS_DENIED on this pod. */
export const COFEPLUS_LIVE_POD_ID = 'RCK541'

export function defaultPodForEnvironment(environment: CofeplusEnvironment) {
  return environment === 'live' ? COFEPLUS_LIVE_POD_ID : COFEPLUS_TEST_POD_ID
}

/** Swap the known opposite-env pod when Test/Live is toggled. */
export function suggestPodForEnvironment(
  environment: CofeplusEnvironment,
  podId?: string | null
) {
  const current = podId?.trim() || ''
  if (!current) return defaultPodForEnvironment(environment)
  if (environment === 'live' && current === COFEPLUS_TEST_POD_ID) {
    return COFEPLUS_LIVE_POD_ID
  }
  if (environment === 'test' && current === COFEPLUS_LIVE_POD_ID) {
    return COFEPLUS_TEST_POD_ID
  }
  return current
}

export function podAccessHint(
  environment: CofeplusEnvironment,
  podId: string,
  availablePods: string[] = []
) {
  const available =
    availablePods.length > 0
      ? availablePods.join(', ')
      : defaultPodForEnvironment(environment)
  if (environment === 'live') {
    return `Pod ${podId} is not available on Live (CofePlus POD_ACCESS_DENIED). Use ${COFEPLUS_LIVE_POD_ID} on Live, or switch Connection to Test for ${COFEPLUS_TEST_POD_ID}. Available: ${available}.`
  }
  return `Pod ${podId} is not available on Test (CofePlus POD_ACCESS_DENIED). Use ${COFEPLUS_TEST_POD_ID} on Test, or switch Connection to Live for ${COFEPLUS_LIVE_POD_ID}. Available: ${available}.`
}

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
