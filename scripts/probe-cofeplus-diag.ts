/**
 * Hit the deployed /api/diag/cofeplus* routes (each is its own Vercel function,
 * so they can egress from different IPs) and summarise reachability per IP.
 *
 * Usage:
 *   npx tsx scripts/probe-cofeplus-diag.ts [baseUrl] [callsPerRoute]
 *
 * Needs COFEPLUS_DIAG_TOKEN in .env (its sha256 is in lib/cofeplus/diag.ts).
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

loadEnv({ path: resolve(process.cwd(), '.env') })

const BASE = (process.argv[2] || 'https://kafei-admin.vercel.app').replace(/\/$/, '')
const CALLS = Number(process.argv[3] || 3)
const ROUTES = ['cofeplus', 'cofeplus-60', 'cofeplus-default']

interface Probe {
  name: string
  ok: boolean
  ms: number
  status?: number
  error?: string
  body?: string
}

interface DiagResult {
  group: string
  region: string | null
  egressIp: string
  dns: Array<{ address: string }>
  rounds: Probe[][]
}

async function main() {
  const token = process.env.COFEPLUS_DIAG_TOKEN
  if (!token) throw new Error('COFEPLUS_DIAG_TOKEN missing from .env')

  console.log(`Base: ${BASE}  calls/route: ${CALLS}\n`)
  const byIp = new Map<string, { calls: number; failed: number }>()

  for (const route of ROUTES) {
    for (let i = 0; i < CALLS; i += 1) {
      const started = Date.now()
      const res = await fetch(`${BASE}/api/diag/${route}`, {
        headers: { 'x-diag-token': token },
        cache: 'no-store',
      })
      const ms = Date.now() - started
      if (!res.ok) {
        console.log(`✗ ${route} #${i + 1}  HTTP ${res.status} (${ms}ms)  ${(await res.text()).slice(0, 120)}`)
        continue
      }

      const data = (await res.json()) as DiagResult
      const probes = data.rounds.flat()
      const failed = probes.filter((p) => !p.ok)
      const stats = byIp.get(data.egressIp) ?? { calls: 0, failed: 0 }
      stats.calls += 1
      if (failed.length) stats.failed += 1
      byIp.set(data.egressIp, stats)

      const podStatus = probes.find((p) => p.name === 'fresh pod status with auth')
      console.log(
        `${failed.length ? '✗' : '✓'} ${route} #${i + 1}  ip=${data.egressIp}  region=${data.region}  ` +
          `dns=${data.dns.map((d) => d.address).join(',')}  ${probes.length - failed.length}/${probes.length} ok  ` +
          `pod=${podStatus?.status ?? '-'} ${podStatus?.body ?? podStatus?.error ?? ''}  (${ms}ms)`
      )
      for (const p of failed) console.log(`    ${p.name}: ${p.error} (${p.ms}ms)`)
    }
  }

  console.log('\nBy egress IP:')
  for (const [ip, s] of byIp) {
    console.log(`  ${ip}  ${s.calls - s.failed}/${s.calls} calls fully OK`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
