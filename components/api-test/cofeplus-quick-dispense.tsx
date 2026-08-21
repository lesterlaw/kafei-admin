'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Coffee,
  Loader2,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
} from 'lucide-react'
import { proxyCofeplusRequest } from '@/app/actions/cofeplus'
import { getOrSyncCofeplusMenu } from '@/app/actions/cofeplus-sync'
import { suggestPodForEnvironment } from '@/lib/cofeplus/config'
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
import { cn } from '@/lib/utils'
import {
  TERMINAL_DISPATCH_STATES,
  buildDispatchBody,
  isDispatchArchivedError,
  modifierExtraTotal,
  modifiersToChoiceMap,
  parseCreateDispatch,
  parseDispatchSnapshot,
  parseDispatchState,
  podItemFromCacheRow,
  selectModifiersFromGroups,
  type ConnectionState,
  type CreateDispatchResult,
  type PodItemOption,
  type PodSummary,
} from './cofeplus-test-shared'
import type { ApiTestFlowPrefs } from './cofeplus-test-prefs'
import { CofeplusModifierPicker } from './cofeplus-modifier-picker'

/**
 * One-tap dispense for admin testing.
 * Each click uses a fresh Idempotency-Key so you can fire again without Reset.
 */
export function CofeplusQuickDispense({
  connection,
  savedFlow,
  onFlowPrefsChange,
  onDefaultPodIdChange,
}: {
  connection: ConnectionState
  savedFlow: ApiTestFlowPrefs
  onFlowPrefsChange: (flow: ApiTestFlowPrefs) => void
  onDefaultPodIdChange: (podId: string) => void
}) {
  const [pods, setPods] = useState<PodSummary[]>([])
  const [podId, setPodId] = useState(
    suggestPodForEnvironment(
      connection.environment,
      savedFlow.podId || connection.defaultPodId || ''
    )
  )
  const [items, setItems] = useState<PodItemOption[]>([])
  const [selectedItem, setSelectedItem] = useState<PodItemOption | null>(null)
  const [modifierChoices, setModifierChoices] = useState<Record<string, string>>(
    () => ({ ...savedFlow.modifierChoices })
  )
  const [filter, setFilter] = useState('')
  const [mode, setMode] = useState<'immediate' | 'pickup'>(
    savedFlow.mode || 'immediate'
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dispatch, setDispatch] = useState<CreateDispatchResult | null>(null)
  const [dispatchState, setDispatchState] = useState<string | null>(null)
  const [lastItem, setLastItem] = useState<PodItemOption | null>(null)
  const [pickupQrDataUrl, setPickupQrDataUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipPersistRef = useRef(true)

  useEffect(() => {
    const next = suggestPodForEnvironment(
      connection.environment,
      connection.defaultPodId || podId
    )
    if (next && next !== podId) {
      setPodId(next)
      setItems([])
    }
  }, [connection.defaultPodId, connection.environment]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    onFlowPrefsChange({
      ...savedFlow,
      podId,
      mode,
      itemCode: selectedItem?.itemCode || lastItem?.itemCode || savedFlow.itemCode,
      modifierChoices,
    })
  }, [podId, mode, selectedItem?.itemCode, lastItem?.itemCode, modifierChoices]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const code = dispatch?.pickupCode?.trim()
    if (!code || code === '(none)' || mode !== 'pickup') {
      setPickupQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setPickupQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPickupQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [dispatch?.pickupCode, mode])

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.display.toLowerCase().includes(q) ||
        item.itemCode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    )
  }, [filter, items])

  const configuredModifiers = useMemo(() => {
    if (!selectedItem) return []
    return selectModifiersFromGroups(
      selectedItem.modifierGroups,
      modifierChoices
    )
  }, [selectedItem, modifierChoices])

  const request = async (
    label: string,
    options: Parameters<typeof proxyCofeplusRequest>[0]
  ) => {
    const response = await proxyCofeplusRequest({
      ...options,
      accessToken: connection.accessToken || undefined,
      baseUrl: connection.baseUrl || undefined,
      environment: connection.environment,
    })
    console.log(`[cofeplus-quick] ${label}`, {
      status: response.status,
      url: response.requestUrl,
    })
    return response
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setPolling(false)
  }

  const clearActiveDispatch = () => {
    stopPolling()
    setDispatch(null)
    setDispatchState(null)
    setPickupQrDataUrl(null)
    setError(null)
  }

  const fetchDispatchOnce = async (
    activePodId: string,
    orderId: string,
    { silent = false }: { silent?: boolean } = {}
  ) => {
    const response = await request('Fetch dispatch', {
      method: 'GET',
      path: `/partner/v1/dispatches/${encodeURIComponent(activePodId)}/${encodeURIComponent(orderId)}`,
    })

    let body = response.body
    let ok = response.ok

    if (!ok && isDispatchArchivedError(response.status, response.body)) {
      const archived = await request('Fetch archived order', {
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(activePodId)}/orders/${encodeURIComponent(orderId)}`,
      })
      if (archived.ok) {
        body = archived.body
        ok = true
      }
    }

    if (!ok) {
      if (!silent) {
        throw new Error(`Fetch failed (${response.status})`)
      }
      return null
    }

    let state = parseDispatchState(body)
    try {
      state = parseDispatchSnapshot(body).state
    } catch {
      // keep fallback
    }
    setDispatchState(state)
    if (TERMINAL_DISPATCH_STATES.has(state)) {
      stopPolling()
    }
    return state
  }

  const startPolling = (activePodId: string, orderId: string) => {
    stopPolling()
    setPolling(true)
    let attempts = 0
    const maxAttempts = mode === 'pickup' ? 150 : 60
    pollTimerRef.current = setInterval(() => {
      attempts += 1
      void fetchDispatchOnce(activePodId, orderId, { silent: true })
      if (attempts >= maxAttempts) {
        stopPolling()
      }
    }, 2000)
  }

  const handleLoadMenu = async (targetPodId = podId) => {
    if (!targetPodId.trim()) {
      setError('Enter a pod ID first')
      return
    }
    setBusy('menu')
    setError(null)
    try {
      let requested = targetPodId.trim()
      let result = await getOrSyncCofeplusMenu({
        environment: connection.environment,
        podId: requested,
        force: true,
      })
      let nextPods: PodSummary[] = result.pods.map((pod) => ({
        podId: pod.pod_id,
        display: pod.display || pod.pod_id,
      }))
      setPods(nextPods)

      let merged = result.items
        .map((row) => podItemFromCacheRow(row))
        .filter((item): item is PodItemOption => item !== null)

      if ((!result.ok || merged.length === 0) && nextPods.length > 0) {
        const fallback = nextPods.find((pod) => pod.podId !== requested)
        if (fallback) {
          requested = fallback.podId
          setPodId(requested)
          result = await getOrSyncCofeplusMenu({
            environment: connection.environment,
            podId: requested,
            force: true,
          })
          nextPods = result.pods.map((pod) => ({
            podId: pod.pod_id,
            display: pod.display || pod.pod_id,
          }))
          setPods(nextPods)
          merged = result.items
            .map((row) => podItemFromCacheRow(row))
            .filter((item): item is PodItemOption => item !== null)
        }
      }

      if (!result.ok || merged.length === 0) {
        throw new Error(
          result.error || 'No sellable items in the synced menu for this pod'
        )
      }

      setItems(merged)
      setSelectedItem((current) => {
        const next =
          merged.find((item) => item.itemCode === current?.itemCode) ||
          merged.find((item) => item.itemCode === savedFlow.itemCode) ||
          null
        if (next) {
          setModifierChoices(modifiersToChoiceMap(next.modifiers))
        }
        return next
      })
      onDefaultPodIdChange(requested)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu')
    } finally {
      setBusy(null)
    }
  }

  const handleSelectItem = (item: PodItemOption) => {
    setSelectedItem(item)
    setModifierChoices(modifiersToChoiceMap(item.modifiers))
    setError(null)
  }

  const handleDispense = async (item = selectedItem) => {
    if (!item) {
      setError('Select a drink first')
      return
    }
    if (!podId.trim()) {
      setError('Enter a pod ID first')
      return
    }

    const modifiers =
      item.itemCode === selectedItem?.itemCode
        ? configuredModifiers
        : item.modifiers

    // Always start a fresh order — clear previous flow state + use new idempotency key
    clearActiveDispatch()
    setBusy(item.itemCode)
    setLastItem(item)

    try {
      const body = buildDispatchBody(item, {
        lang: 'en',
        channel: 'mobile',
        deliveryPort: Number(savedFlow.deliveryPort) || 1,
        displayNote: item.display,
        modifiers,
      })

      const idempotencyKey = `kafei-quick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

      const response = await request(
        mode === 'pickup' ? 'Quick pickup' : 'Quick dispense',
        {
          method: 'POST',
          path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
          query: { mode },
          headers: {
            'Idempotency-Key': idempotencyKey,
            'Content-Type': 'application/json',
          },
          body,
        }
      )

      if (!response.ok) {
        throw new Error(
          `Dispense failed (${response.status}): ${response.body.slice(0, 280)}`
        )
      }

      const created = parseCreateDispatch(response.body)
      setDispatch(created)
      await fetchDispatchOnce(podId, created.id)
      startPolling(podId, created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispense failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quick dispense</CardTitle>
          <CardDescription>
            Tap a drink, set milk / temperature / extras, then dispense. Each
            generate uses a fresh idempotency key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label>Pod</Label>
              {pods.length > 0 ? (
                <Select
                  value={podId}
                  onValueChange={(value) => {
                    setPodId(value)
                    setItems([])
                    setSelectedItem(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select pod" />
                  </SelectTrigger>
                  <SelectContent>
                    {pods.map((pod) => (
                      <SelectItem key={pod.podId} value={pod.podId}>
                        {pod.display} ({pod.podId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={podId}
                  onChange={(event) => setPodId(event.target.value)}
                  placeholder={
                    connection.environment === 'live' ? 'e.g. RCK541' : 'e.g. RCK111'
                  }
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={mode}
                onValueChange={(value) =>
                  setMode(value as 'immediate' | 'pickup')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">
                    immediate (brew now)
                  </SelectItem>
                  <SelectItem value="pickup">pickup (QR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filter drinks</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="iced latte…"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                onClick={() => void handleLoadMenu()}
                disabled={busy !== null || !podId.trim()}
              >
                {busy === 'menu' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Load menu
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Load the menu, tap a drink, customise options, then generate.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const isBusy = busy === item.itemCode
                const isSelected = selectedItem?.itemCode === item.itemCode
                return (
                  <button
                    key={item.itemCode}
                    type="button"
                    disabled={busy !== null || item.outOfStock}
                    onClick={() => handleSelectItem(item)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                      'hover:border-foreground/30 hover:bg-muted/40',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      isSelected && 'border-foreground/40 bg-muted/50',
                      item.outOfStock && 'opacity-40'
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-medium">
                        {isBusy ? (
                          <Loader2 className="mr-1 inline size-4 animate-spin" />
                        ) : mode === 'pickup' ? (
                          <QrCode className="mr-1 inline size-4" />
                        ) : (
                          <Play className="mr-1 inline size-4" />
                        )}
                        {item.display}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.price}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.category}
                      {item.outOfStock ? ' · out of stock' : ''}
                    </span>
                    <code className="text-[10px] text-muted-foreground">
                      {item.itemCode}
                    </code>
                    {item.modifierGroups.length > 0 ? (
                      <span className="text-[10px] text-muted-foreground">
                        {item.modifierGroups.length} options
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          {selectedItem ? (
            <div className="space-y-4 rounded-lg border p-4">
              <CofeplusModifierPicker
                item={selectedItem}
                choices={modifierChoices}
                onChange={setModifierChoices}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {selectedItem.display}
                  {modifierExtraTotal(configuredModifiers) > 0
                    ? ` + extras ${modifierExtraTotal(configuredModifiers)}`
                    : ''}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleDispense(selectedItem)}
                  disabled={busy !== null}
                >
                  {busy === selectedItem.itemCode ? (
                    <Loader2 className="animate-spin" />
                  ) : mode === 'pickup' ? (
                    <QrCode />
                  ) : (
                    <Play />
                  )}
                  {mode === 'pickup' ? 'Generate pickup QR' : 'Dispense now'}
                </Button>
              </div>
            </div>
          ) : items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Tap a drink to choose options, then generate.
            </p>
          ) : null}

          {filteredItems.length === 0 && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No drinks match “{filter}”.
            </p>
          )}
        </CardContent>
      </Card>

      {(dispatch || lastItem) && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Last dispense</CardTitle>
              <CardDescription>
                {lastItem?.display || 'Drink'} · {mode}
                {polling ? ' · polling' : ''}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {polling && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={stopPolling}
                >
                  <Square />
                  Stop
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearActiveDispatch}
              >
                <RotateCcw />
                Clear
              </Button>
              {lastItem && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleDispense(lastItem)}
                  disabled={busy !== null}
                >
                  {busy === lastItem.itemCode ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Coffee />
                  )}
                  Dispense again
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dispatch ? (
              <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                {mode === 'pickup' && (
                  <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-3">
                    {pickupQrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pickupQrDataUrl}
                        alt={`Pickup QR for ${dispatch.pickupCode}`}
                        width={180}
                        height={180}
                        className="rounded-md bg-white p-2"
                      />
                    ) : (
                      <div className="flex h-[180px] w-[180px] items-center justify-center text-sm text-muted-foreground">
                        Generating QR…
                      </div>
                    )}
                    <p className="font-mono text-xl font-semibold tracking-widest">
                      {dispatch.pickupCode}
                    </p>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">State</span>
                    <Badge
                      variant={
                        dispatchState === 'failed'
                          ? 'destructive'
                          : dispatchState === 'ready' ||
                              dispatchState === 'done'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {dispatchState || '…'}
                    </Badge>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Order ID</span>
                    <code className="max-w-[70%] break-all text-right text-xs">
                      {dispatch.id}
                    </code>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Order number</span>
                    <span>{dispatch.orderNumber}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Pod</span>
                    <span>{podId}</span>
                  </div>
                  <p className="pt-2 text-xs text-muted-foreground">
                    Tip: hit Dispense again anytime — it starts a brand new
                    order (does not reuse the previous idempotency key).
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active dispatch.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
