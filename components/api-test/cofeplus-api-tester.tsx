'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, Copy, Check, ExternalLink, KeyRound } from 'lucide-react'
import {
  getCofeplusEnvConfig,
  mintCofeplusAccessToken,
  proxyCofeplusRequest,
  saveActiveCofeplusEnvironment,
} from '@/app/actions/cofeplus'
import type { CofeplusResponse } from '@/lib/cofeplus/client'
import {
  COFEPLUS_DOCS_URL,
  COFEPLUS_LIVE_BASE_URL,
  COFEPLUS_TEST_BASE_URL,
  suggestPodForEnvironment,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  COFEPLUS_ENDPOINTS,
  ENDPOINT_GROUPS,
  type ApiEndpoint,
} from './cofeplus-endpoints'
import { CofeplusE2eFlow } from './cofeplus-e2e-flow'
import { CofeplusQuickDispense } from './cofeplus-quick-dispense'
import { CofeplusSyncPanel } from './cofeplus-sync-panel'
import {
  applyItemToDispatchBody,
  formatJson,
  mergeModifiersFromItems,
  parsePodItems,
  summarizeCofeplusResponse,
  type ConnectionState,
  type PodItemOption,
} from './cofeplus-test-shared'
import {
  applyUrlOverrides,
  loadApiTestPrefs,
  saveApiTestPrefs,
  type ApiTestPrefs,
} from './cofeplus-test-prefs'

function buildDefaults(endpoint: ApiEndpoint, defaultPodId: string) {
  const values: Record<string, string> = {}
  for (const field of endpoint.fields) {
    if (field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue
    } else if (field.name === 'podId' && defaultPodId) {
      values[field.name] = defaultPodId
    } else if (field.name === 'from') {
      const from = new Date()
      from.setDate(from.getDate() - 7)
      values[field.name] = from.toISOString()
    } else if (field.name === 'to') {
      values[field.name] = new Date().toISOString()
    } else {
      values[field.name] = ''
    }
  }
  return values
}

function EndpointCard({
  endpoint,
  connection,
}: {
  endpoint: ApiEndpoint
  connection: ConnectionState
}) {
  const [values, setValues] = useState(() =>
    buildDefaults(endpoint, connection.defaultPodId)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CofeplusResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [podItems, setPodItems] = useState<PodItemOption[]>([])
  const [selectedItemCode, setSelectedItemCode] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemsError, setItemsError] = useState<string | null>(null)

  const isCreateDispatch = endpoint.id === 'create-dispatch'
  const parseSummary = result
    ? summarizeCofeplusResponse(endpoint.id, result.status, result.body)
    : null

  useEffect(() => {
    setValues((prev) => {
      if (prev.podId || !connection.defaultPodId) return prev
      if (!endpoint.fields.some((field) => field.name === 'podId')) return prev
      return { ...prev, podId: connection.defaultPodId }
    })
  }, [connection.defaultPodId, endpoint.fields])

  useEffect(() => {
    if (!isCreateDispatch) return
    setPodItems([])
    setSelectedItemCode('')
    setItemsError(null)
  }, [isCreateDispatch, values.podId])

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleLoadItems = async () => {
    const podId = (values.podId || connection.defaultPodId || '').trim()
    if (!podId) {
      setItemsError('Set a Pod ID first')
      return
    }

    setLoadingItems(true)
    setItemsError(null)

    try {
      let response = await proxyCofeplusRequest({
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(podId)}/menu`,
        query: { lang: 'en' },
        accessToken: connection.accessToken || undefined,
        baseUrl: connection.baseUrl || undefined,
        environment: connection.environment,
      })

      if (!response.ok) {
        response = await proxyCofeplusRequest({
          method: 'GET',
          path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
          query: { lang: 'en' },
          accessToken: connection.accessToken || undefined,
          baseUrl: connection.baseUrl || undefined,
          environment: connection.environment,
        })
      }

      if (!response.ok) {
        throw new Error(
          `Failed to load menu/items (${response.status}): ${response.body.slice(0, 200)}`
        )
      }

      let items = parsePodItems(response.body)

      // `/menus/{podId}` (and some menu shapes) omit modifiers — enrich from /items
      const needsModifiers = items.some((item) => item.modifiers.length === 0)
      if (needsModifiers) {
        const itemsResponse = await proxyCofeplusRequest({
          method: 'GET',
          path: `/partner/v1/pods/${encodeURIComponent(podId)}/items`,
          query: { lang: 'en' },
          accessToken: connection.accessToken || undefined,
          baseUrl: connection.baseUrl || undefined,
          environment: connection.environment,
        })
        if (itemsResponse.ok) {
          items = mergeModifiersFromItems(items, parsePodItems(itemsResponse.body))
        }
      }

      setPodItems(items)
      setSelectedItemCode('')

      if (items.length === 0) {
        setItemsError('No sellable items returned for this pod')
      }
    } catch (err) {
      setPodItems([])
      setSelectedItemCode('')
      setItemsError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setLoadingItems(false)
    }
  }

  const handleSelectItem = (itemCode: string) => {
    setSelectedItemCode(itemCode)
    const item = podItems.find((entry) => entry.itemCode === itemCode)
    if (!item) return

    setValues((prev) => ({
      ...prev,
      body: applyItemToDispatchBody(prev.body || '', item),
    }))
  }

  const handleSend = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      let path = endpoint.path
      const query: Record<string, string | string[]> = {}
      const headers: Record<string, string> = {}
      let body: string | null = null

      for (const field of endpoint.fields) {
        const raw = (values[field.name] ?? '').trim()
        if (field.required && !raw) {
          throw new Error(`${field.label} is required`)
        }
        if (!raw && field.in !== 'body') continue

        if (field.in === 'path') {
          path = path.replace(`{${field.name}}`, encodeURIComponent(raw))
        } else if (field.in === 'query') {
          if (field.name === 'podId' || field.name === 'state' || field.name === 'uri' || field.name === 'lang') {
            const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
            if (parts.length > 1) {
              query[field.name] = parts
            } else if (parts.length === 1) {
              query[field.name] = parts[0]
            }
          } else {
            query[field.name] = raw
          }
        } else if (field.in === 'header') {
          headers[field.name] = raw
        } else if (field.in === 'body') {
          const parsed = JSON.parse(raw) as {
            lineItems?: Array<{ itemCode?: string }>
          }
          if (
            isCreateDispatch &&
            !parsed.lineItems?.[0]?.itemCode
          ) {
            throw new Error('Select a pod item first (itemCode is empty)')
          }
          body = raw
        }
      }

      if (path.includes('{')) {
        throw new Error('Path still contains unresolved placeholders')
      }

      if (endpoint.contentType) {
        headers['Content-Type'] = endpoint.contentType
      }

      console.log(`[cofeplus-ui] → ${endpoint.id}`, {
        method: endpoint.method,
        path,
        env: connection.environment,
        query,
        body,
      })

      const response = await proxyCofeplusRequest({
        method: endpoint.method,
        path,
        query,
        headers,
        body,
        skipAuth: endpoint.requiresAuth === false,
        accessToken: connection.accessToken || undefined,
        baseUrl: connection.baseUrl || undefined,
        environment: connection.environment,
      })

      console.log(`[cofeplus-ui] ← ${endpoint.id}`, {
        status: response.status,
        durationMs: response.durationMs,
        url: response.requestUrl,
        authSource: response.authSource,
        bodyPreview: response.body.slice(0, 500),
      })

      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(formatJson(result.body))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={endpoint.method === 'GET' ? 'secondary' : 'default'}
            className="font-mono"
          >
            {endpoint.method}
          </Badge>
          <code className="text-sm break-all">{endpoint.path}</code>
        </div>
        <CardTitle className="text-lg">{endpoint.title}</CardTitle>
        <CardDescription>{endpoint.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCreateDispatch && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-2">
                <Label htmlFor={`${endpoint.id}-item-picker`}>
                  Load item from pod menu
                </Label>
                <Select
                  value={
                    podItems.some((item) => item.itemCode === selectedItemCode)
                      ? selectedItemCode
                      : undefined
                  }
                  onValueChange={handleSelectItem}
                  disabled={podItems.length === 0}
                >
                  <SelectTrigger id={`${endpoint.id}-item-picker`}>
                    <SelectValue
                      placeholder={
                        podItems.length
                          ? 'Select an item…'
                          : 'Load items first'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {podItems.map((item) => (
                      <SelectItem key={item.itemCode} value={item.itemCode}>
                        {`${item.category} · ${item.display} (${item.itemCode}) — ${item.price}${
                          item.outOfStock ? ' [out of stock]' : ''
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadItems}
                disabled={loadingItems}
              >
                {loadingItems ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                {podItems.length ? 'Reload menu' : 'Load menu'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Calls <code>GET /partner/v1/pods/{'{podId}'}/menu?lang=en</code>{' '}
              (falls back to <code>/items</code>) and fills{' '}
              <code>itemCode</code>, default <code>modifiers</code>,{' '}
              <code>price</code>, and <code>pricing.total</code> below.
            </p>
            {itemsError && (
              <p className="text-xs text-destructive">{itemsError}</p>
            )}
            {!itemsError && podItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {podItems.length} items loaded
              </p>
            )}
          </div>
        )}

        {endpoint.fields.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {endpoint.fields.map((field) => {
              const fullWidth = field.type === 'json' || field.type === 'textarea'
              return (
                <div
                  key={field.name}
                  className={cn('space-y-2', fullWidth && 'md:col-span-2')}
                >
                  <Label htmlFor={`${endpoint.id}-${field.name}`}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Label>
                  {field.type === 'select' ? (
                    <Select
                      value={values[field.name] ? values[field.name] : '__empty'}
                      onValueChange={(value) =>
                        setValue(field.name, value === '__empty' ? '' : value)
                      }
                    >
                      <SelectTrigger id={`${endpoint.id}-${field.name}`}>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem
                            key={option.value || 'empty'}
                            value={option.value || '__empty'}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'json' || field.type === 'textarea' ? (
                    <Textarea
                      id={`${endpoint.id}-${field.name}`}
                      value={values[field.name] || ''}
                      onChange={(event) => setValue(field.name, event.target.value)}
                      className="min-h-48 font-mono text-xs"
                      spellCheck={false}
                    />
                  ) : (
                    <Input
                      id={`${endpoint.id}-${field.name}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={values[field.name] || ''}
                      onChange={(event) => setValue(field.name, event.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                  {field.help && (
                    <p className="text-xs text-muted-foreground">{field.help}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Button onClick={handleSend} disabled={loading}>
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Play />
          )}
          Send request
        </Button>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.ok ? 'default' : 'destructive'}>
                {result.status} {result.statusText}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {result.durationMs} ms
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={handleCopy}
              >
                {copied ? <Check /> : <Copy />}
                Copy body
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Request</p>
              <code className="block break-all text-xs">
                {result.requestMethod} {result.requestUrl}
              </code>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {result.environment && (
                  <Badge variant="outline">{result.environment}</Badge>
                )}
                {result.authSource && (
                  <Badge variant="outline">auth:{result.authSource}</Badge>
                )}
              </div>
              {result.requestBody ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Request body
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap break-all">
                    {formatJson(result.requestBody)}
                  </pre>
                </details>
              ) : null}
            </div>
            {parseSummary ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Parsed
                </p>
                <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                  {parseSummary}
                </p>
              </div>
            ) : null}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Response</p>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {formatJson(result.body) || '(empty body)'}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CofeplusApiTester() {
  const [prefsReady, setPrefsReady] = useState(false)
  const [prefs, setPrefs] = useState<ApiTestPrefs | null>(null)
  const [connection, setConnection] = useState<ConnectionState>({
    environment: 'test',
    baseUrl: COFEPLUS_TEST_BASE_URL,
    accessToken: '',
    defaultPodId: 'RCK111',
    hasEnvToken: false,
    hasHmacSecret: false,
    hasTestHmacSecret: false,
    hasLiveHmacSecret: false,
    testBaseUrl: COFEPLUS_TEST_BASE_URL,
    liveBaseUrl: COFEPLUS_LIVE_BASE_URL,
    kid: 'client/v242kafei',
    tokenExpiresAt: null,
  })
  const [viewMode, setViewMode] = useState<'quick' | 'flow' | 'raw'>('quick')
  const [activeGroup, setActiveGroup] = useState<string>('health')
  const [minting, setMinting] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)

  useEffect(() => {
    const loaded = applyUrlOverrides(loadApiTestPrefs())
    const defaultPodId = suggestPodForEnvironment(
      loaded.environment,
      loaded.defaultPodId
    )
    const next = {
      ...loaded,
      defaultPodId,
      flow: { ...loaded.flow, podId: defaultPodId || loaded.flow.podId },
    }
    setPrefs(next)
    setViewMode(next.viewMode)
    setConnection((prev) => {
      const baseUrl =
        next.environment === 'live' ? prev.liveBaseUrl : prev.testBaseUrl
      return {
        ...prev,
        environment: next.environment,
        baseUrl,
        defaultPodId: next.defaultPodId,
        hasHmacSecret:
          next.environment === 'live'
            ? prev.hasLiveHmacSecret
            : prev.hasTestHmacSecret,
      }
    })
    setPrefsReady(true)
  }, [])

  useEffect(() => {
    if (!prefsReady || !prefs) return
    saveApiTestPrefs(prefs)
  }, [prefs, prefsReady])

  useEffect(() => {
    if (!prefsReady) return
    setPrefs((prev) => {
      if (!prev) return prev
      if (
        prev.environment === connection.environment &&
        prev.defaultPodId === connection.defaultPodId &&
        prev.viewMode === viewMode
      ) {
        return prev
      }
      return {
        ...prev,
        environment: connection.environment,
        defaultPodId: connection.defaultPodId,
        viewMode,
        flow: {
          ...prev.flow,
          podId: connection.defaultPodId || prev.flow.podId,
        },
      }
    })
  }, [
    connection.defaultPodId,
    connection.environment,
    prefsReady,
    viewMode,
  ])

  useEffect(() => {
    void getCofeplusEnvConfig()
      .then((config) => {
        setConnection((prev) => {
          const environment =
            config.activeEnvironment === 'live' ||
            config.activeEnvironment === 'test'
              ? config.activeEnvironment
              : prev.environment
          const defaultPodId = suggestPodForEnvironment(
            environment,
            prev.defaultPodId
          )
          const baseUrl =
            environment === 'live'
              ? config.liveBaseUrl || prev.liveBaseUrl
              : config.testBaseUrl || prev.testBaseUrl
          const hasHmacSecret =
            environment === 'live'
              ? config.hasLiveHmacSecret
              : config.hasTestHmacSecret

          return {
            ...prev,
            environment,
            defaultPodId,
            baseUrl,
            hasEnvToken: config.hasAccessToken,
            hasHmacSecret,
            hasTestHmacSecret: config.hasTestHmacSecret,
            hasLiveHmacSecret: config.hasLiveHmacSecret,
            testBaseUrl: config.testBaseUrl || prev.testBaseUrl,
            liveBaseUrl: config.liveBaseUrl || prev.liveBaseUrl,
            kid: config.kid || prev.kid,
          }
        })
      })
      .catch(() => {
        // Page still usable with manual token entry
      })
  }, [])

  const groupedEndpoints = useMemo(() => {
    return ENDPOINT_GROUPS.map((group) => ({
      ...group,
      endpoints: COFEPLUS_ENDPOINTS.filter((endpoint) => endpoint.group === group.id),
    }))
  }, [])

  const handleMintToken = async (environment = connection.environment) => {
    setMinting(true)
    setMintError(null)
    try {
      const minted = await mintCofeplusAccessToken(3600, environment)
      setConnection((prev) => ({
        ...prev,
        accessToken: minted.token,
        tokenExpiresAt: new Date(minted.payload.exp * 1000).toISOString(),
      }))
    } catch (err) {
      setMintError(err instanceof Error ? err.message : 'Failed to mint JWT')
    } finally {
      setMinting(false)
    }
  }

  const handleEnvironmentChange = (environment: CofeplusEnvironment) => {
    setMintError(null)
    void saveActiveCofeplusEnvironment(environment).catch((err) => {
      setMintError(
        err instanceof Error
          ? err.message
          : 'Failed to save environment for the mobile app'
      )
    })
    setConnection((prev) => {
      const baseUrl =
        environment === 'live' ? prev.liveBaseUrl : prev.testBaseUrl
      const hasHmacSecret =
        environment === 'live'
          ? prev.hasLiveHmacSecret
          : prev.hasTestHmacSecret
      const defaultPodId = suggestPodForEnvironment(
        environment,
        prev.defaultPodId
      )

      return {
        ...prev,
        environment,
        baseUrl,
        hasHmacSecret,
        accessToken: '',
        tokenExpiresAt: null,
        defaultPodId,
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Docs live at{' '}
            <a
              href={COFEPLUS_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              service-gate.cofeplus.com/docs
            </a>
            . Toggle Test / Live to switch host + HMAC. Kid stays{' '}
            <code>{connection.kid}</code>. Leave the token blank to auto-mint
            per request.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Environment</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={connection.environment === 'test' ? 'default' : 'outline'}
                onClick={() => handleEnvironmentChange('test')}
              >
                Test
              </Button>
              <Button
                type="button"
                size="sm"
                variant={connection.environment === 'live' ? 'default' : 'outline'}
                onClick={() => handleEnvironmentChange('live')}
              >
                Live
              </Button>
              <Badge
                variant={
                  connection.environment === 'live' ? 'destructive' : 'secondary'
                }
              >
                {connection.environment === 'live' ? 'LIVE' : 'TEST'}
              </Badge>
              {connection.environment === 'test' && connection.hasTestHmacSecret && (
                <Badge variant="secondary">test HMAC</Badge>
              )}
              {connection.environment === 'live' && connection.hasLiveHmacSecret && (
                <Badge variant="secondary">live HMAC</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Test → <code>{connection.testBaseUrl}</code>
              {' · '}
              Live → <code>{connection.liveBaseUrl}</code>
              {' · '}
              This switch is what the mobile app uses for new orders.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={connection.baseUrl}
              onChange={(event) =>
                setConnection((prev) => ({ ...prev, baseUrl: event.target.value }))
              }
              placeholder={
                connection.environment === 'live'
                  ? COFEPLUS_LIVE_BASE_URL
                  : COFEPLUS_TEST_BASE_URL
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="accessToken">Access Token (JWT)</Label>
              <div className="flex flex-wrap gap-2">
                {connection.hasHmacSecret && (
                  <Badge variant="secondary">HMAC configured</Badge>
                )}
                {connection.hasEnvToken && (
                  <Badge variant="secondary">env token set</Badge>
                )}
              </div>
            </div>
            <Input
              id="accessToken"
              type="password"
              value={connection.accessToken}
              onChange={(event) =>
                setConnection((prev) => ({
                  ...prev,
                  accessToken: event.target.value,
                  tokenExpiresAt: null,
                }))
              }
              placeholder={
                connection.hasHmacSecret
                  ? `Blank = auto-mint ${connection.environment} JWT per request`
                  : `Paste partner JWT or configure ${
                      connection.environment === 'live'
                        ? 'COFEPLUS_LIVE_HMAC_SECRET'
                        : 'COFEPLUS_HMAC_SECRET'
                    }`
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleMintToken()}
                disabled={minting || !connection.hasHmacSecret}
              >
                {minting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                Generate JWT
              </Button>
              {connection.tokenExpiresAt && (
                <span className="text-xs text-muted-foreground">
                  Expires {connection.tokenExpiresAt}
                </span>
              )}
            </div>
            {mintError && (
              <p className="text-xs text-destructive">{mintError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultPodId">Default Pod ID</Label>
            <Input
              id="defaultPodId"
              value={connection.defaultPodId}
              onChange={(event) =>
                setConnection((prev) => ({
                  ...prev,
                  defaultPodId: event.target.value,
                }))
              }
              placeholder={
                connection.environment === 'live' ? 'RCK541' : 'RCK111'
              }
            />
            <p className="text-xs text-muted-foreground">
              Saved in this browser with env, item, and dispatch settings. Deep
              link: <code>?env=live&pod=ID&item=CODE&mode=pickup</code>
            </p>
          </div>
          <div className="flex items-end">
            <Button variant="outline" asChild>
              <a href={COFEPLUS_DOCS_URL} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open Swagger docs
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <CofeplusSyncPanel
        environment={connection.environment}
        defaultPodId={connection.defaultPodId}
      />

      <div className="space-y-4">
        <Tabs
          value={viewMode}
          onValueChange={(value: string) =>
            setViewMode(value as 'quick' | 'flow' | 'raw')
          }
        >
          <TabsList>
            <TabsTrigger value="quick">Quick dispense</TabsTrigger>
            <TabsTrigger value="flow">End-to-end flow</TabsTrigger>
            <TabsTrigger value="raw">Raw endpoints</TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === 'quick' ? (
          prefs ? (
            <CofeplusQuickDispense
              connection={connection}
              savedFlow={prefs.flow}
              onFlowPrefsChange={(flow) =>
                setPrefs((prev) =>
                  prev
                    ? {
                        ...prev,
                        defaultPodId: flow.podId || prev.defaultPodId,
                        flow,
                      }
                    : prev
                )
              }
              onDefaultPodIdChange={(podId) =>
                setConnection((prev) => ({ ...prev, defaultPodId: podId }))
              }
            />
          ) : null
        ) : viewMode === 'flow' ? (
          prefs ? (
            <CofeplusE2eFlow
              connection={connection}
              savedFlow={prefs.flow}
              onFlowPrefsChange={(flow) =>
                setPrefs((prev) =>
                  prev
                    ? {
                        ...prev,
                        defaultPodId: flow.podId || prev.defaultPodId,
                        flow,
                      }
                    : prev
                )
              }
              onDefaultPodIdChange={(podId) =>
                setConnection((prev) => ({ ...prev, defaultPodId: podId }))
              }
            />
          ) : null
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ENDPOINT_GROUPS.map((group) => (
                <Button
                  key={group.id}
                  type="button"
                  size="sm"
                  variant={activeGroup === group.id ? 'default' : 'outline'}
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.label}
                </Button>
              ))}
            </div>

            <div className="space-y-4">
              {groupedEndpoints
                .find((group) => group.id === activeGroup)
                ?.endpoints.map((endpoint) => (
                  <EndpointCard
                    key={endpoint.id}
                    endpoint={endpoint}
                    connection={connection}
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
