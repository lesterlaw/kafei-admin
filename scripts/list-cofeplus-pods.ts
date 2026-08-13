/**
 * List CofePlus pods for test (demo) and live, plus Kafei kiosk pod_id mapping.
 *
 *   npx tsx scripts/list-cofeplus-pods.ts
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { callCofeplusApi } from '../lib/cofeplus/client'
import { getCofeplusConfig, type CofeplusEnvironment } from '../lib/cofeplus/config'
import { generateCofeplusJwt } from '../lib/cofeplus/jwt'
import { parsePods } from '../components/api-test/cofeplus-test-shared'

loadEnv({ path: resolve(process.cwd(), '.env') })

async function listPods(environment: CofeplusEnvironment) {
  const config = getCofeplusConfig(environment)
  console.log(`\n=== ${environment.toUpperCase()} ===`)
  console.log(`base: ${config.baseUrl}`)
  console.log(`hmac: ${config.hmacSecret ? 'configured' : 'MISSING'}`)

  let token = ''
  try {
    token = generateCofeplusJwt(3600, environment).token
  } catch (err) {
    console.log(`auth error: ${err instanceof Error ? err.message : err}`)
    return []
  }

  const response = await callCofeplusApi({
    method: 'GET',
    path: '/partner/v1/pods',
    accessToken: token,
    baseUrl: config.baseUrl,
    environment,
    log: false,
  })

  console.log(`GET /partner/v1/pods -> ${response.status} ${response.statusText}`)

  if (!response.ok) {
    console.log(`body: ${response.body.slice(0, 400)}`)
    return []
  }

  try {
    const pods = parsePods(response.body)
    if (pods.length === 0) {
      console.log('pods: (none)')
      console.log(`raw: ${response.body.slice(0, 400)}`)
      return []
    }

    for (const pod of pods) {
      const statusRes = await callCofeplusApi({
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(pod.podId)}/status`,
        accessToken: token,
        baseUrl: config.baseUrl,
        environment,
        log: false,
      })
      const status = statusRes.ok ? statusRes.body.trim() : `${statusRes.status}`
      console.log(`- ${pod.podId}  ${pod.display}  status=${status}`)
    }
    return pods
  } catch (err) {
    console.log(`parse error: ${err instanceof Error ? err.message : err}`)
    console.log(`raw: ${response.body.slice(0, 400)}`)
    return []
  }
}

async function listKiosks() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('\n=== KAFEI KIOSKS ===')
    console.log('Missing Supabase credentials')
    return
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n=== KAFEI KIOSKS ===')
  const { data: kiosks, error } = await supabase
    .from('kiosks')
    .select('id, name, address, pod_id, is_active')
    .order('name', { ascending: true })

  if (error) {
    console.log(`kiosks error: ${error.message}`)
    return
  }

  for (const kiosk of kiosks || []) {
    console.log(
      `- ${kiosk.name}  pod_id=${kiosk.pod_id || '(empty)'}  active=${kiosk.is_active}  ${kiosk.address}`
    )
  }

  console.log('\n=== CACHED COFEPLUS PODS ===')
  const { data: cached, error: cacheError } = await supabase
    .from('cofeplus_pods')
    .select('environment, pod_id, display, synced_at')
    .order('environment', { ascending: true })
    .order('pod_id', { ascending: true })

  if (cacheError) {
    console.log(`cache error: ${cacheError.message}`)
    return
  }

  if (!cached?.length) {
    console.log('(none synced yet)')
    return
  }

  for (const row of cached) {
    console.log(
      `- [${row.environment}] ${row.pod_id}  ${row.display}  synced=${row.synced_at}`
    )
  }
}

async function main() {
  await listPods('test')
  await listPods('live')
  await listKiosks()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
