import { createHash } from 'crypto'
import dns from 'dns/promises'
import https from 'https'
import net from 'net'
import tls from 'tls'
import { getCofeplusConfig } from '@/lib/cofeplus/config'
import { fixedLookup, getCofeplusConnectIp } from '@/lib/cofeplus/connect-override'
import { generateCofeplusJwt } from '@/lib/cofeplus/jwt'

const DIAG_TOKEN_SHA256 =
  'fba996988c0394290abf036b2150910ac7962914533a3ca13677b583ec76d07a'
const PROBE_TIMEOUT_MS = 7_000
const POD_ID = 'RCK541'

interface ProbeResult {
  name: string
  ok: boolean
  ms: number
  status?: number
  phases?: Record<string, number>
  remote?: string
  error?: string
  body?: string
}

export function isDiagAuthorized(token: string | null) {
  if (!token) return false
  return createHash('sha256').update(token).digest('hex') === DIAG_TOKEN_SHA256
}

function errorText(err: unknown) {
  if (!(err instanceof Error)) return String(err)
  const code = (err as NodeJS.ErrnoException).code
  return code ? `${code} ${err.message}` : err.message
}

function tcpProbe(name: string, host: string, port: number): Promise<ProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const finish = (result: Omit<ProbeResult, 'name' | 'ms'>) => {
      socket.destroy()
      resolve({ name, ms: Date.now() - started, ...result })
    }
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish({ ok: false, error: 'TCP connect timeout' }))
    socket.once('connect', () => finish({ ok: true, remote: `${socket.remoteAddress}:${socket.remotePort}` }))
    socket.once('error', (err) => finish({ ok: false, error: errorText(err) }))
  })
}

function tlsProbe(name: string, host: string): Promise<ProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const phases: Record<string, number> = {}
    const socket = tls.connect({ host, port: 443, servername: host })
    const finish = (result: Omit<ProbeResult, 'name' | 'ms'>) => {
      socket.destroy()
      resolve({ name, ms: Date.now() - started, phases, ...result })
    }
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish({ ok: false, error: 'TLS timeout' }))
    socket.once('connect', () => { phases.tcp = Date.now() - started })
    socket.once('secureConnect', () => finish({ ok: true, remote: socket.remoteAddress }))
    socket.once('error', (err) => finish({ ok: false, error: errorText(err) }))
  })
}

function httpsProbe(
  name: string,
  url: string,
  headers: Record<string, string>,
  connectIp?: string
): Promise<ProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const phases: Record<string, number> = {}
    let settled = false
    const finish = (result: Omit<ProbeResult, 'name' | 'ms'>) => {
      if (settled) return
      settled = true
      resolve({ name, ms: Date.now() - started, phases, ...result })
    }
    const options = {
      method: 'GET',
      headers,
      agent: false as const,
      ...(connectIp ? { lookup: fixedLookup(connectIp) } : {}),
    }
    const req = https.request(url, options, (res) => {
      phases.firstByte = Date.now() - started
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { if (body.length < 200) body += chunk })
      res.on('end', () => finish({ ok: true, status: res.statusCode, body: body.slice(0, 200) }))
      res.on('error', (err) => finish({ ok: false, status: res.statusCode, error: errorText(err) }))
    })
    req.on('socket', (socket) => {
      socket.once('lookup', () => { phases.dns = Date.now() - started })
      socket.once('connect', () => { phases.tcp = Date.now() - started })
      socket.once('secureConnect', () => { phases.tls = Date.now() - started })
    })
    req.setTimeout(PROBE_TIMEOUT_MS, () => {
      finish({ ok: false, error: 'HTTPS timeout' })
      req.destroy()
    })
    req.on('error', (err) => finish({ ok: false, error: errorText(err) }))
    req.end()
  })
}

async function fetchProbe(
  name: string,
  url: string,
  headers: Record<string, string>
): Promise<ProbeResult> {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const body = await res.text()
    return { name, ok: true, ms: Date.now() - started, status: res.status, body: body.slice(0, 200) }
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` cause=${errorText(err.cause)}` : ''
    return { name, ok: false, ms: Date.now() - started, error: `${errorText(err)}${cause}` }
  }
}

async function egressIp() {
  try {
    const res = await fetch('https://checkip.amazonaws.com', {
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    })
    return (await res.text()).trim()
  } catch (err) {
    return `unknown (${errorText(err)})`
  }
}

export async function runCofeplusDiagnostics(group: string) {
  const config = getCofeplusConfig('live')
  const base = config.baseUrl.replace(/\/$/, '')
  const host = new URL(base).hostname
  const token = generateCofeplusJwt(3600, 'live').token
  const auth = { Accept: 'application/json', Authorization: `Bearer ${token}` }
  const plain = { Accept: 'application/json' }
  const liveness = `${base}/health/liveness`
  const podStatus = `${base}/partner/v1/pods/${POD_ID}/status`
  const relayIp = getCofeplusConnectIp(base)

  const [ip, lookup] = await Promise.all([
    egressIp(),
    dns.lookup(host, { all: true }).catch((err) => [{ address: errorText(err), family: 0 }]),
  ])

  const rounds: ProbeResult[][] = []
  for (let round = 0; round < 2; round += 1) {
    rounds.push(
      await Promise.all([
        tcpProbe('tcp 443 by hostname', host, 443),
        tcpProbe('tcp 443 to 8.153.75.138', '8.153.75.138', 443),
        tlsProbe('tls handshake', host),
        httpsProbe('fresh liveness no auth', liveness, plain),
        httpsProbe('fresh liveness with auth header', liveness, auth),
        httpsProbe('fresh pod status no auth', podStatus, plain),
        httpsProbe('fresh pod status with auth', podStatus, auth),
        fetchProbe('fetch liveness', liveness, plain),
        fetchProbe('fetch pod status with auth', podStatus, auth),
        ...(relayIp
          ? [
              tcpProbe('relay tcp 443', relayIp, 443),
              httpsProbe('relay liveness no auth', liveness, plain, relayIp),
              httpsProbe('relay pod status with auth', podStatus, auth, relayIp),
            ]
          : []),
      ])
    )
  }

  return {
    group,
    at: new Date().toISOString(),
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    egressIp: ip,
    relayIp,
    dns: lookup,
    rounds,
  }
}
