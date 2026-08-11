import type { CofeplusEnvironment } from '@/lib/cofeplus/config'

const STORAGE_KEY = 'kafei.cofeplus-api-test.prefs.v1'

export interface ApiTestFlowPrefs {
  podId: string
  itemCode: string
  modifierChoices: Record<string, string>
  mode: 'immediate' | 'pickup'
  channel: 'mobile' | 'on-site'
  deliveryPort: string
}

export interface ApiTestPrefs {
  environment: CofeplusEnvironment
  defaultPodId: string
  viewMode: 'quick' | 'flow' | 'raw'
  flow: ApiTestFlowPrefs
}

export const DEFAULT_FLOW_PREFS: ApiTestFlowPrefs = {
  podId: 'RCK111',
  itemCode: '',
  modifierChoices: {},
  mode: 'pickup',
  channel: 'mobile',
  deliveryPort: '1',
}

export const DEFAULT_API_TEST_PREFS: ApiTestPrefs = {
  environment: 'test',
  defaultPodId: 'RCK111',
  viewMode: 'quick',
  flow: DEFAULT_FLOW_PREFS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEnvironment(value: unknown): CofeplusEnvironment {
  return value === 'live' ? 'live' : 'test'
}

function parseViewMode(value: unknown): 'quick' | 'flow' | 'raw' {
  if (value === 'raw' || value === 'flow' || value === 'quick') return value
  return 'quick'
}

function parseMode(value: unknown): 'immediate' | 'pickup' {
  return value === 'immediate' ? 'immediate' : 'pickup'
}

function parseChannel(value: unknown): 'mobile' | 'on-site' {
  return value === 'on-site' ? 'on-site' : 'mobile'
}

function parseModifierChoices(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry) {
      next[key] = entry
    }
  }
  return next
}

function parseFlowPrefs(value: unknown): ApiTestFlowPrefs {
  if (!isRecord(value)) return { ...DEFAULT_FLOW_PREFS }
  return {
    podId:
      typeof value.podId === 'string' && value.podId
        ? value.podId
        : DEFAULT_FLOW_PREFS.podId,
    itemCode: typeof value.itemCode === 'string' ? value.itemCode : '',
    modifierChoices: parseModifierChoices(value.modifierChoices),
    mode: parseMode(value.mode),
    channel: parseChannel(value.channel),
    deliveryPort:
      typeof value.deliveryPort === 'string' && value.deliveryPort
        ? value.deliveryPort
        : typeof value.deliveryPort === 'number'
          ? String(value.deliveryPort)
          : DEFAULT_FLOW_PREFS.deliveryPort,
  }
}

export function loadApiTestPrefs(): ApiTestPrefs {
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_API_TEST_PREFS,
      flow: { ...DEFAULT_FLOW_PREFS },
    }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        ...DEFAULT_API_TEST_PREFS,
        flow: { ...DEFAULT_FLOW_PREFS },
      }
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return {
        ...DEFAULT_API_TEST_PREFS,
        flow: { ...DEFAULT_FLOW_PREFS },
      }
    }

    const flow = parseFlowPrefs(parsed.flow)
    const defaultPodId =
      typeof parsed.defaultPodId === 'string' && parsed.defaultPodId
        ? parsed.defaultPodId
        : flow.podId || DEFAULT_API_TEST_PREFS.defaultPodId

    return {
      environment: parseEnvironment(parsed.environment),
      defaultPodId,
      viewMode: parseViewMode(parsed.viewMode),
      flow: {
        ...flow,
        podId: flow.podId || defaultPodId,
      },
    }
  } catch {
    return {
      ...DEFAULT_API_TEST_PREFS,
      flow: { ...DEFAULT_FLOW_PREFS },
    }
  }
}

export function saveApiTestPrefs(prefs: ApiTestPrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore quota / private mode failures
  }
}

export function hasResumeableFlow(flow: ApiTestFlowPrefs): boolean {
  return Boolean(flow.podId.trim() && flow.itemCode.trim())
}

/** Read ?env=&pod=&item=&mode=&channel=&port= over local prefs (once). */
export function applyUrlOverrides(prefs: ApiTestPrefs): ApiTestPrefs {
  if (typeof window === 'undefined') return prefs

  const params = new URLSearchParams(window.location.search)
  const env = params.get('env')
  const pod = params.get('pod')
  const item = params.get('item')
  const mode = params.get('mode')
  const channel = params.get('channel')
  const port = params.get('port')

  if (!env && !pod && !item && !mode && !channel && !port) {
    return prefs
  }

  const next: ApiTestPrefs = {
    ...prefs,
    flow: { ...prefs.flow },
  }

  if (env === 'live' || env === 'test') {
    next.environment = env
  }
  if (pod?.trim()) {
    next.defaultPodId = pod.trim()
    next.flow.podId = pod.trim()
  }
  if (item?.trim()) {
    next.flow.itemCode = item.trim()
  }
  if (mode === 'immediate' || mode === 'pickup') {
    next.flow.mode = mode
  }
  if (channel === 'mobile' || channel === 'on-site') {
    next.flow.channel = channel
  }
  if (port?.trim()) {
    next.flow.deliveryPort = port.trim()
  }

  return next
}
