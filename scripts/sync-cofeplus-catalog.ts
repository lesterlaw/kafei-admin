/**
 * Sync CofePlus pods + menu into cache (and Kafei kiosks/products).
 *
 *   npx tsx scripts/sync-cofeplus-catalog.ts
 *   npx tsx scripts/sync-cofeplus-catalog.ts --env=live
 *   npx tsx scripts/sync-cofeplus-catalog.ts --pod=RCK111
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { syncCofeplusCatalog } from '../lib/cofeplus/sync'
import type { CofeplusEnvironment } from '../lib/cofeplus/config'

loadEnv({ path: resolve(process.cwd(), '.env') })

function argValue(flag: string) {
  const prefix = `${flag}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : ''
}

async function main() {
  const environment: CofeplusEnvironment =
    argValue('--env') === 'live' ? 'live' : 'test'
  const podId = argValue('--pod') || (environment === 'test' ? 'RCK111' : 'RCK541')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase credentials')
  }

  const adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Syncing ${environment} pod=${podId}`)
  const result = await syncCofeplusCatalog(adminClient, {
    environment,
    podId,
    upsertKafeiRecords: true,
  })

  if (!result.ok) {
    console.error('Sync failed:', result.error)
    process.exit(1)
  }

  console.log(
    `OK pods=${result.podsSynced} items=${result.itemsSynced} kiosks=${result.kiosksUpserted} products=${result.productsUpserted}`
  )
  for (const pod of result.pods) {
    console.log(`- ${pod.podId}  ${pod.display}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
