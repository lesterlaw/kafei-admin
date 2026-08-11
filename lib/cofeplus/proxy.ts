import {
  callCofeplusApi,
  type CofeplusRequestOptions,
  type CofeplusResponse,
} from '@/lib/cofeplus/client'
import {
  getCofeplusConfig,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'
import { generateCofeplusJwt } from '@/lib/cofeplus/jwt'

export function resolveCofeplusEnvironment(
  environment?: CofeplusEnvironment | string | null
): CofeplusEnvironment {
  return environment === 'live' ? 'live' : 'test'
}

/**
 * Authenticated CofePlus call used by admin UI and mobile order APIs.
 * Secrets stay server-side; only the environment label is chosen by the client.
 */
export async function executeCofeplusRequest(
  options: CofeplusRequestOptions & {
    skipAuth?: boolean
    environment?: CofeplusEnvironment | string | null
  }
): Promise<CofeplusResponse> {
  const environment = resolveCofeplusEnvironment(options.environment)
  const config = getCofeplusConfig(environment)
  let accessToken = ''
  let authSource = 'skipped'

  if (!options.skipAuth) {
    if (options.accessToken?.trim()) {
      accessToken = options.accessToken.trim()
      authSource = 'provided'
    } else if (config.accessToken) {
      accessToken = config.accessToken
      authSource = 'env-token'
    } else if (config.hmacSecret) {
      accessToken = generateCofeplusJwt(3600, environment).token
      authSource = 'minted'
    } else {
      authSource = 'missing'
    }
  }

  if (!options.skipAuth && !accessToken) {
    return {
      ok: false,
      status: 0,
      statusText: 'Auth Error',
      headers: {},
      body: JSON.stringify({
        error: 'COFEPLUS_AUTH_MISSING',
        message: `No HMAC secret configured for ${environment} environment`,
      }),
      durationMs: 0,
      requestUrl: '',
      requestMethod: options.method.toUpperCase(),
      requestBody: options.body ?? null,
      environment,
      authSource,
    }
  }

  const baseUrl = options.baseUrl?.trim() || config.baseUrl

  if (!options.path?.startsWith('/')) {
    throw new Error('Path must start with /')
  }

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase())) {
    throw new Error('Unsupported HTTP method')
  }

  console.log(
    `[cofeplus] proxy ${options.method.toUpperCase()} ${options.path} env=${environment} auth=${authSource} base=${baseUrl}`
  )

  return callCofeplusApi({
    ...options,
    accessToken,
    baseUrl,
    environment,
    authSource,
  })
}
