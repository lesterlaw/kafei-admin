import { COFEPLUS_DEFAULT_BASE_URL } from './config'
import { logCofeplusRequest, logCofeplusResponse } from './logger'

export interface CofeplusRequestOptions {
  method: string
  path: string
  query?: Record<string, string | string[] | undefined | null>
  headers?: Record<string, string>
  body?: string | null
  accessToken?: string
  baseUrl?: string
  /** Used only for logging (e.g. test | live) */
  environment?: string
  /** Used only for logging (e.g. minted | provided | skipped) */
  authSource?: string
  /** Set false to silence server logs for a call */
  log?: boolean
  /** Abort the request after this many milliseconds */
  timeoutMs?: number
}

export interface CofeplusResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
  requestUrl: string
  requestMethod: string
  requestBody: string | null
  environment?: string
  authSource?: string
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: CofeplusRequestOptions['query']
) {
  const url = new URL(
    path.startsWith('/') ? path : `/${path}`,
    baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  )

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null && item !== '') {
            url.searchParams.append(key, item)
          }
        }
      } else {
        url.searchParams.set(key, value)
      }
    }
  }

  return url.toString()
}

export async function callCofeplusApi(
  options: CofeplusRequestOptions
): Promise<CofeplusResponse> {
  const baseUrl = (options.baseUrl || COFEPLUS_DEFAULT_BASE_URL).replace(
    /\/$/,
    ''
  )
  const requestUrl = buildUrl(baseUrl, options.path, options.query)
  const method = options.method.toUpperCase()
  const shouldLog = options.log !== false

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    ...options.headers,
  }

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  if (
    options.body &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/json'
  }

  const requestBody = options.body ?? null
  const startedAt = Date.now()

  if (shouldLog) {
    logCofeplusRequest({
      environment: options.environment,
      method,
      url: requestUrl,
      headers,
      body: requestBody,
      authSource: options.authSource,
    })
  }

  try {
    const controller = new AbortController()
    const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 0
    const timer =
      timeoutMs > 0
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null

    let response: Response
    try {
      response = await fetch(requestUrl, {
        method,
        headers,
        body: options.body ?? undefined,
        cache: 'no-store',
        signal: controller.signal,
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
    const durationMs = Date.now() - startedAt
    const body = await response.text()

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const result: CofeplusResponse = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
      durationMs,
      requestUrl,
      requestMethod: method,
      requestBody,
      environment: options.environment,
      authSource: options.authSource,
    }

    if (shouldLog) {
      logCofeplusResponse({
        environment: options.environment,
        method,
        url: requestUrl,
        status: result.status,
        statusText: result.statusText,
        durationMs,
        body,
        ok: result.ok,
      })
    }

    return result
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const cause =
      err instanceof Error
        ? err.cause instanceof Error
          ? err.cause.message
          : err.message
        : 'Network request failed'

    const result: CofeplusResponse = {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: JSON.stringify({
        error: 'NETWORK_ERROR',
        message: cause,
      }),
      durationMs,
      requestUrl,
      requestMethod: method,
      requestBody,
      environment: options.environment,
      authSource: options.authSource,
    }

    if (shouldLog) {
      console.error('[cofeplus] network error', {
        environment: options.environment,
        method,
        url: requestUrl,
        durationMs,
        cause,
      })
      logCofeplusResponse({
        environment: options.environment,
        method,
        url: requestUrl,
        status: result.status,
        statusText: result.statusText,
        durationMs,
        body: result.body,
        ok: false,
      })
    }

    return result
  }
}
