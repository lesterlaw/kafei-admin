/**
 * Offline verification of COFEPLUS response parsers against captured fixtures.
 *
 * Usage:
 *   FIXTURES_DIR=/tmp/cofeplus-fixtures npx tsx scripts/verify-cofeplus-parsers.ts
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  isDispatchArchivedError,
  mergeModifiersFromItems,
  parseDispatchSnapshot,
  parseHealthReadiness,
  parseOamMenuSummary,
  parseOrderHistoryExport,
  parseOrderHistoryPage,
  parsePod,
  parsePodItems,
  parsePodStatus,
  parsePods,
  parseSingleItem,
  summarizeCofeplusResponse,
} from '../components/api-test/cofeplus-test-shared'

const FIXTURES_DIR =
  process.env.FIXTURES_DIR || '/tmp/cofeplus-fixtures'

function load(name: string) {
  const path = join(FIXTURES_DIR, name)
  if (!existsSync(path)) {
    throw new Error(`Missing fixture: ${path}`)
  }
  return readFileSync(path, 'utf8')
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    console.error(`  ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}

check('health readiness', () => {
  const r = parseHealthReadiness(load('readiness.txt'))
  assert(r.status === 'ready', `expected ready, got ${r.status}`)
  assert(r.dependencies.database === 'connected', 'database dep')
})

check('pod status', () => {
  assert(parsePodStatus(load('status.txt')) === 'OK', 'status OK')
})

check('list pods', () => {
  const pods = parsePods(load('pods.txt'))
  assert(pods.length >= 1, 'at least one pod')
  assert(pods[0].podId === 'RCK111', 'podId RCK111')
})

check('fetch pod', () => {
  const pod = parsePod(load('pod.txt'))
  assert(pod.podId === 'RCK111', 'podId')
  assert(pod.display.includes('武夷'), 'display')
})

check('pod menu has modifiers', () => {
  const items = parsePodItems(load('podMenu.txt'))
  assert(items.length > 0, 'items')
  const withMods = items.filter((i) => i.modifiers.length > 0)
  assert(withMods.length > 0, 'expected default modifiers from pod menu')
})

check('menus endpoint omits modifiers; merge from items', () => {
  const menuItems = parsePodItems(load('menus.txt'))
  assert(menuItems.length > 0, 'menu items')
  const without = menuItems.filter((i) => i.modifiers.length === 0)
  assert(without.length > 0, 'menus should lack modifiers')

  const flat = parsePodItems(load('items.txt'))
  const merged = mergeModifiersFromItems(menuItems, flat)
  const enriched = merged.filter((i) => i.modifiers.length > 0)
  assert(enriched.length > 0, 'merge should attach modifiers')
})

check('flat items', () => {
  const items = parsePodItems(load('items.txt'))
  assert(items.length > 0, 'items')
  assert(
    items.some((i) => i.modifiers.length > 0),
    'flat items have modifiers'
  )
})

check('single item (catalog)', () => {
  const item = parseSingleItem(load('item.txt'))
  assert(item.itemCode === 'test0116110022', 'itemCode')
  assert(item.modifiers.length > 0, 'modifiers')
})

check('single pod item', () => {
  const item = parseSingleItem(load('podItem.txt'))
  assert(item.itemCode === 'test0116110022', 'itemCode')
  assert(item.price === 659, 'price')
})

check('orders page', () => {
  const page = parseOrderHistoryPage(load('orders.txt'))
  assert(page.items.length > 0, 'orders')
  assert(page.items[0].id, 'id')
  assert(page.items[0].state, 'state')
  assert(page.items[0].queueToken, 'queueToken')
})

check('orders export NDJSON', () => {
  const items = parseOrderHistoryExport(load('export.txt'))
  assert(items.length === 50, `expected 50 export rows, got ${items.length}`)
  assert(items[0].podId === 'RCK111', 'podId')
})

check('archived order snapshot', () => {
  const snap = parseDispatchSnapshot(load('archived.txt'))
  assert(snap.state === 'done', 'state done')
  assert(snap.archived === true, 'archived')
  assert(snap.lineItemCodes.includes('test0116320018'), 'line item')
})

check('410 DISPATCH_ARCHIVED detection', () => {
  assert(
    isDispatchArchivedError(410, load('dispatch.txt')),
    'should detect archived'
  )
  assert(
    !isDispatchArchivedError(200, load('archived.txt')),
    '200 should not be archived error'
  )
})

check('oam menu summary', () => {
  const summary = parseOamMenuSummary(load('oamMenu.txt'))
  assert(summary.categoryCount === 21, `categories ${summary.categoryCount}`)
  assert(summary.itemCodeCount > 0, 'item refs')
})

check('summarize helpers', () => {
  const s1 = summarizeCofeplusResponse('list-pods', 200, load('pods.txt'))
  assert(s1?.includes('RCK111'), s1 || 'missing summary')
  const s2 = summarizeCofeplusResponse('query-orders', 200, load('orders.txt'))
  assert(s2?.includes('orders'), s2 || 'missing orders summary')
  const s3 = summarizeCofeplusResponse('fetch-dispatch', 410, load('dispatch.txt'))
  assert(s3?.includes('archived'), s3 || 'missing 410 summary')
  const s4 = summarizeCofeplusResponse('list-menu', 200, load('menus.txt'))
  assert(s4?.includes('sellable'), s4 || 'missing menu summary')
})

console.log(`\n${passed} checks passed`)
