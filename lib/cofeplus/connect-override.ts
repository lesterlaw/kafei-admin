import https from 'https'
import net from 'net'
import { COFEPLUS_LIVE_BASE_URL } from './config'

const LIVE_GATE_HOST = new URL(COFEPLUS_LIVE_BASE_URL).hostname

/**
 * Fixed-egress relay for the live Gate (infra/gate-relay/README.md). When
 * COFEPLUS_LIVE_CONNECT_IP is set, sockets for service-gate.cofeplus.com are
 * opened to that IP instead of the DNS answer. The URL, TLS SNI, certificate
 * name and Host header all stay on the original hostname, so the relay only
 * sees opaque TCP. Unset the variable to roll back.
 */
export function getCofeplusConnectIp(requestUrl: string): string | null {
  const ip = process.env.COFEPLUS_LIVE_CONNECT_IP?.trim()
  if (!ip || net.isIP(ip) === 0) return null

  try {
    const url = new URL(requestUrl)
    if (url.protocol !== 'https:' || url.hostname !== LIVE_GATE_HOST) return null
  } catch {
    return null
  }

  return ip
}

export function fixedLookup(ip: string): net.LookupFunction {
  const family = net.isIP(ip)
  return ((_hostname, options, callback) => {
    // Node asks for all addresses when autoSelectFamily is on (default since 20).
    if (typeof options === 'object' && options?.all) {
      callback(null, [{ address: ip, family }] as never, family)
    } else {
      callback(null, ip, family)
    }
  }) as net.LookupFunction
}

export interface PinnedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export function requestViaConnectIp(
  requestUrl: string,
  connectIp: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string | null
    timeoutMs: number
  }
): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const headers = { ...init.headers }
    if (init.body) headers['Content-Length'] = String(Buffer.byteLength(init.body))

    const req = https.request(
      requestUrl,
      {
        method: init.method,
        headers,
        agent: false,
        lookup: fixedLookup(connectIp),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('error', fail)
        res.on('end', () => {
          clearTimeout(timer)
          const responseHeaders: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (value === undefined) continue
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: responseHeaders,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      }
    )

    function fail(err: Error) {
      clearTimeout(timer)
      reject(err)
    }

    const timer = setTimeout(() => {
      req.destroy(new Error(`Timed out after ${init.timeoutMs}ms via relay ${connectIp}`))
    }, init.timeoutMs)

    req.on('error', fail)
    req.end(init.body ?? undefined)
  })
}
