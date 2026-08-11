/**
 * Live probe of COFEPLUS partner/health endpoints + parser summaries.
 *
 * Usage:
 *   npx tsx scripts/probe-cofeplus-endpoints.ts
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { callCofeplusApi } from '../lib/cofeplus/client'
import { generateCofeplusJwt } from '../lib/cofeplus/jwt'
import { getCofeplusConfig } from '../lib/cofeplus/config'
import { summarizeCofeplusResponse } from '../components/api-test/cofeplus-test-shared'

loadEnv({ path: resolve(process.cwd(), '.env') })

const POD = process.env.COFEPLUS_PROBE_POD || 'RCK111'

interface Probe {
  id: string
  method: string
  path: string
  query?: Record<string, string>
  skipAuth?: boolean
}

const probes: Probe[] = [
  { id: 'health-liveness', method: 'GET', path: '/health/liveness', skipAuth: true },
  { id: 'health-readiness', method: 'GET', path: '/health/readiness', skipAuth: true },
  { id: 'list-pods', method: 'GET', path: '/partner/v1/pods' },
  { id: 'fetch-pod', method: 'GET', path: `/partner/v1/pods/${POD}` },
  {
    id: 'fetch-pod-status',
    method: 'GET',
    path: `/partner/v1/pods/${POD}/status`,
  },
  {
    id: 'list-menu',
    method: 'GET',
    path: `/partner/v1/menus/${POD}`,
    query: { lang: 'en' },
  },
  {
    id: 'fetch-pod-menu',
    method: 'GET',
    path: `/partner/v1/pods/${POD}/menu`,
    query: { lang: 'en' },
  },
  {
    id: 'list-pod-items',
    method: 'GET',
    path: `/partner/v1/pods/${POD}/items`,
    query: { lang: 'en' },
  },
  {
    id: 'query-orders',
    method: 'GET',
    path: '/partner/v1/orders',
    query: {
      podId: POD,
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
      limit: '5',
    },
  },
  {
    id: 'export-orders',
    method: 'GET',
    path: '/partner/v1/orders/export',
    query: {
      podId: POD,
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
    },
  },
  {
    id: 'oam-get-menu',
    method: 'GET',
    path: `/oam/v1/pods/${POD}/menu`,
  },
]

async function main() {
  const config = getCofeplusConfig()
  const token = generateCofeplusJwt().token
  console.log(`Base: ${config.baseUrl}`)
  console.log(`Pod:  ${POD}`)
  console.log('')

  let failed = 0

  for (const probe of probes) {
    const response = await callCofeplusApi({
      method: probe.method,
      path: probe.path,
      query: probe.query,
      accessToken: probe.skipAuth ? undefined : token,
      baseUrl: config.baseUrl,
    })

    const summary = summarizeCofeplusResponse(
      probe.id,
      response.status,
      response.body
    )
    const ok = response.ok && summary && !summary.startsWith('Parse note:')
    if (!ok) failed += 1

    console.log(
      `${ok ? '✓' : '✗'} ${probe.id}  ${response.status}  ${summary || '(no summary)'}`
    )
    if (!response.ok) {
      console.log(`    body: ${response.body.slice(0, 160)}`)
    }
  }

  // Single item from flat list
  const itemsRes = await callCofeplusApi({
    method: 'GET',
    path: `/partner/v1/pods/${POD}/items`,
    query: { lang: 'en' },
    accessToken: token,
    baseUrl: config.baseUrl,
  })
  if (itemsRes.ok) {
    const items = JSON.parse(itemsRes.body) as Array<{ itemCode?: string }>
    const code = items.find((i) => i.itemCode)?.itemCode
    if (code) {
      for (const probe of [
        {
          id: 'fetch-pod-item',
          path: `/partner/v1/pods/${POD}/items/${encodeURIComponent(code)}`,
        },
        {
          id: 'fetch-item',
          path: `/partner/v1/items/${POD}/${encodeURIComponent(code)}`,
        },
      ]) {
        const response = await callCofeplusApi({
          method: 'GET',
          path: probe.path,
          query: { lang: 'en' },
          accessToken: token,
          baseUrl: config.baseUrl,
        })
        const summary = summarizeCofeplusResponse(
          probe.id,
          response.status,
          response.body
        )
        const ok = response.ok && summary && !summary.startsWith('Parse note:')
        if (!ok) failed += 1
        console.log(
          `${ok ? '✓' : '✗'} ${probe.id}  ${response.status}  ${summary || '(no summary)'}`
        )
      }
    }
  }

  // Archived order if available
  const ordersRes = await callCofeplusApi({
    method: 'GET',
    path: '/partner/v1/orders',
    query: {
      podId: POD,
      from: new Date(Date.now() - 7 * 86400000).toISOString(),
      to: new Date().toISOString(),
      limit: '1',
    },
    accessToken: token,
    baseUrl: config.baseUrl,
  })
  if (ordersRes.ok) {
    const page = JSON.parse(ordersRes.body) as {
      items?: Array<{ id: string }>
    }
    const orderId = page.items?.[0]?.id
    if (orderId) {
      const archived = await callCofeplusApi({
        method: 'GET',
        path: `/partner/v1/pods/${POD}/orders/${encodeURIComponent(orderId)}`,
        accessToken: token,
        baseUrl: config.baseUrl,
      })
      const summary = summarizeCofeplusResponse(
        'fetch-order-history',
        archived.status,
        archived.body
      )
      const ok = archived.ok && summary && !summary.startsWith('Parse note:')
      if (!ok) failed += 1
      console.log(
        `${ok ? '✓' : '✗'} fetch-order-history  ${archived.status}  ${summary || '(no summary)'}`
      )

      const live = await callCofeplusApi({
        method: 'GET',
        path: `/partner/v1/dispatches/${POD}/${encodeURIComponent(orderId)}`,
        accessToken: token,
        baseUrl: config.baseUrl,
      })
      const liveSummary = summarizeCofeplusResponse(
        'fetch-dispatch',
        live.status,
        live.body
      )
      // 410 archived is expected for done orders
      const liveOk =
        (live.ok || live.status === 410) &&
        liveSummary &&
        !liveSummary.startsWith('Parse note:')
      if (!liveOk) failed += 1
      console.log(
        `${liveOk ? '✓' : '✗'} fetch-dispatch  ${live.status}  ${liveSummary || '(no summary)'}`
      )
    }
  }

  console.log('')
  if (failed) {
    console.error(`${failed} probe(s) failed`)
    process.exit(1)
  }
  console.log('All live probes parsed OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
