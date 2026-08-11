'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Square,
  Zap,
} from 'lucide-react'
import { proxyCofeplusRequest } from '@/app/actions/cofeplus'
import type { CofeplusResponse } from '@/lib/cofeplus/client'
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
  formatJson,
  isDispatchArchivedError,
  mergeModifiersFromItems,
  modifierExtraTotal,
  modifiersToChoiceMap,
  parseCreateDispatch,
  parseDispatchSnapshot,
  parseDispatchState,
  parsePodItems,
  parsePods,
  selectModifiersFromGroups,
  type ConnectionState,
  type CreateDispatchResult,
  type DispatchModifier,
  type PodItemOption,
  type PodSummary,
} from './cofeplus-test-shared'
import {
  hasResumeableFlow,
  type ApiTestFlowPrefs,
} from './cofeplus-test-prefs'

interface FlowLogEntry {
  id: string
  label: string
  at: string
  ok: boolean
  status: number
  durationMs: number
  detail: string
  environment?: string
  authSource?: string
  requestBody?: string | null
  body?: string
}

type FlowStep = 1 | 2 | 3 | 4

/** Partner gate rejects en-US; use the short tag. */
const FLOW_LANG = 'en'

function getFlowSteps(mode: 'immediate' | 'pickup') {
  return [
    {
      id: 1 as FlowStep,
      title: 'Pod',
      description: 'Pick a machine and check status',
    },
    {
      id: 2 as FlowStep,
      title: 'Item',
      description: 'Load menu and choose a drink',
    },
    {
      id: 3 as FlowStep,
      title: 'Dispatch',
      description:
        mode === 'pickup'
          ? 'Create pickup order + QR'
          : 'Create immediate brew order',
    },
    {
      id: 4 as FlowStep,
      title: mode === 'pickup' ? 'Redeem' : 'Track',
      description:
        mode === 'pickup'
          ? 'Show QR at pod, then track brew'
          : 'Poll live dispatch status',
    },
  ]
}

function StepIndicator({
  step,
  currentStep,
  completedThrough,
}: {
  step: ReturnType<typeof getFlowSteps>[number]
  currentStep: FlowStep
  completedThrough: number
}) {
  const done = completedThrough >= step.id
  const active = currentStep === step.id

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-start gap-3 rounded-md border p-3',
        active && 'border-foreground/30 bg-muted/40',
        done && !active && 'border-emerald-500/30'
      )}
    >
      <div className="mt-0.5">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : active ? (
          <Circle className="h-4 w-4 text-foreground" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {step.id}. {step.title}
        </p>
        <p className="text-xs text-muted-foreground">{step.description}</p>
      </div>
    </div>
  )
}

export function CofeplusE2eFlow({
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
  const [currentStep, setCurrentStep] = useState<FlowStep>(1)
  const [completedThrough, setCompletedThrough] = useState(0)

  const [pods, setPods] = useState<PodSummary[]>([])
  const [podId, setPodId] = useState(
    savedFlow.podId || connection.defaultPodId || ''
  )
  const [podStatus, setPodStatus] = useState<string | null>(null)

  const [items, setItems] = useState<PodItemOption[]>([])
  const [itemCode, setItemCode] = useState(savedFlow.itemCode || '')
  const [modifierChoices, setModifierChoices] = useState<Record<string, string>>(
    () => ({ ...savedFlow.modifierChoices })
  )
  const selectedItem = items.find((item) => item.itemCode === itemCode) || null
  const configuredModifiers: DispatchModifier[] = selectedItem
    ? selectModifiersFromGroups(selectedItem.modifierGroups, modifierChoices)
    : []
  const configuredTotal = selectedItem
    ? selectedItem.price + modifierExtraTotal(configuredModifiers)
    : 0

  const [mode, setMode] = useState<'immediate' | 'pickup'>(savedFlow.mode)
  const [activeMode, setActiveMode] = useState<'immediate' | 'pickup' | null>(
    null
  )
  const [deliveryPort, setDeliveryPort] = useState(savedFlow.deliveryPort || '1')
  const [channel, setChannel] = useState<'mobile' | 'on-site'>(savedFlow.channel)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const [dispatch, setDispatch] = useState<CreateDispatchResult | null>(null)
  const [dispatchState, setDispatchState] = useState<string | null>(null)
  const [dispatchBody, setDispatchBody] = useState<string | null>(null)
  const [pickupQrDataUrl, setPickupQrDataUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<FlowLogEntry[]>([])

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const skipPersistRef = useRef(true)
  const onFlowPrefsChangeRef = useRef(onFlowPrefsChange)
  onFlowPrefsChangeRef.current = onFlowPrefsChange
  const flowMode = activeMode || mode
  const steps = getFlowSteps(flowMode)
  const isPickupFlow = flowMode === 'pickup'
  const canResume = hasResumeableFlow({
    podId,
    itemCode: itemCode || savedFlow.itemCode,
    modifierChoices,
    mode,
    channel,
    deliveryPort,
  })

  useEffect(() => {
    if (!connection.defaultPodId || connection.defaultPodId === podId) return
    setPodId(connection.defaultPodId)
  }, [connection.defaultPodId]) // eslint-disable-line react-hooks/exhaustive-deps -- sync from Connection card only

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    onFlowPrefsChangeRef.current({
      podId,
      itemCode,
      modifierChoices,
      mode,
      channel,
      deliveryPort,
    })
  }, [channel, deliveryPort, itemCode, mode, modifierChoices, podId])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const code = dispatch?.pickupCode?.trim()
    if (!code || code === '(none)') {
      setPickupQrDataUrl(null)
      return
    }

    let cancelled = false
    void QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setPickupQrDataUrl(url)
      })
      .catch((err) => {
        console.error('[cofeplus-ui] QR generate failed', err)
        if (!cancelled) setPickupQrDataUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [dispatch?.pickupCode])

  const appendLog = (
    label: string,
    response: CofeplusResponse,
    detail: string
  ) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        at: new Date().toISOString(),
        ok: response.ok,
        status: response.status,
        durationMs: response.durationMs,
        detail,
        environment: response.environment,
        authSource: response.authSource,
        requestBody: response.requestBody,
        body: response.body,
      },
      ...prev,
    ].slice(0, 50))
  }

  const request = async (
    label: string,
    options: Parameters<typeof proxyCofeplusRequest>[0]
  ) => {
    console.log(`[cofeplus-ui] → ${label}`, {
      method: options.method,
      path: options.path,
      env: connection.environment,
      query: options.query,
      body: options.body,
    })
    const response = await proxyCofeplusRequest({
      ...options,
      accessToken: connection.accessToken || undefined,
      baseUrl: connection.baseUrl || undefined,
      environment: connection.environment,
    })
    console.log(`[cofeplus-ui] ← ${label}`, {
      status: response.status,
      durationMs: response.durationMs,
      url: response.requestUrl,
      bodyPreview: response.body.slice(0, 500),
    })
    appendLog(label, response, `${response.requestMethod} ${response.requestUrl}`)
    return response
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setPolling(false)
  }

  const resetFlow = () => {
    // Clears active dispatch/tracking only — keeps saved pod/item/settings
    stopPolling()
    setCurrentStep(itemCode ? 3 : 1)
    setCompletedThrough(itemCode ? 2 : 0)
    setPodStatus(null)
    setDispatch(null)
    setDispatchState(null)
    setDispatchBody(null)
    setPickupQrDataUrl(null)
    setActiveMode(null)
    setError(null)
    setIdempotencyKey('')
    setLogs([])
  }

  const handleLoadPods = async () => {
    setBusy('pods')
    setError(null)
    try {
      const response = await request('List pods', {
        method: 'GET',
        path: '/partner/v1/pods',
      })
      if (!response.ok) {
        throw new Error(`List pods failed (${response.status})`)
      }

      const nextPods = parsePods(response.body)
      setPods(nextPods)
      if (!podId && nextPods[0]) {
        setPodId(nextPods[0].podId)
        onDefaultPodIdChange(nextPods[0].podId)
      }
      setCurrentStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pods')
    } finally {
      setBusy(null)
    }
  }

  const handleCheckPod = async () => {
    if (!podId) {
      setError('Select a pod first')
      return
    }

    setBusy('pod-status')
    setError(null)
    try {
      const response = await request('Fetch pod status', {
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(podId)}/status`,
      })
      if (!response.ok) {
        throw new Error(`Pod status failed (${response.status})`)
      }

      setPodStatus(response.body.trim() || '(empty)')
      setCompletedThrough((prev) => Math.max(prev, 1))
      setCurrentStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check pod')
    } finally {
      setBusy(null)
    }
  }

  const loadItemsForPod = async (
    activePodId: string,
    options?: {
      preferItemCode?: string
      preferModifiers?: Record<string, string>
      advanceStep?: boolean
    }
  ) => {
    // Prefer categorized menu (includes modifiers); fall back to flat items
    let response = await request('Load pod menu', {
      method: 'GET',
      path: `/partner/v1/pods/${encodeURIComponent(activePodId)}/menu`,
      query: { lang: FLOW_LANG },
    })

    if (!response.ok) {
      response = await request('List pod items (fallback)', {
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(activePodId)}/items`,
        query: { lang: FLOW_LANG },
      })
      if (!response.ok) {
        throw new Error(`Load menu/items failed (${response.status})`)
      }
    }

    let nextItems = parsePodItems(response.body)

    const needsModifiers = nextItems.some(
      (item) => item.modifierGroups.length === 0
    )
    if (needsModifiers) {
      const itemsResponse = await request('Enrich modifiers from items', {
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(activePodId)}/items`,
        query: { lang: FLOW_LANG },
      })
      if (itemsResponse.ok) {
        nextItems = mergeModifiersFromItems(
          nextItems,
          parsePodItems(itemsResponse.body)
        )
      }
    }

    setItems(nextItems)
    if (nextItems.length === 0) {
      throw new Error('No sellable items on this pod')
    }

    const preferredCode = options?.preferItemCode?.trim()
    const restored = preferredCode
      ? nextItems.find((item) => item.itemCode === preferredCode)
      : null

    if (restored) {
      const preferred = options?.preferModifiers || {}
      const resolved = selectModifiersFromGroups(
        restored.modifierGroups,
        preferred
      )
      setItemCode(restored.itemCode)
      setModifierChoices(modifiersToChoiceMap(resolved))
      setCompletedThrough((prev) => Math.max(prev, 2))
      if (options?.advanceStep !== false) {
        setCurrentStep(3)
      }
    } else {
      setItemCode('')
      setModifierChoices({})
      setCompletedThrough((prev) => Math.max(prev, 1))
      if (options?.advanceStep !== false) {
        setCurrentStep(2)
      }
    }

    return nextItems
  }

  const handleLoadItems = async () => {
    if (!podId) {
      setError('Select a pod first')
      return
    }

    setBusy('items')
    setError(null)
    try {
      await loadItemsForPod(podId, {
        preferItemCode: itemCode || savedFlow.itemCode,
        preferModifiers:
          Object.keys(modifierChoices).length > 0
            ? modifierChoices
            : savedFlow.modifierChoices,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items')
    } finally {
      setBusy(null)
    }
  }

  const handleResumeLastBrew = async () => {
    const activePodId = (podId || savedFlow.podId || connection.defaultPodId).trim()
    const activeItemCode = (itemCode || savedFlow.itemCode).trim()
    if (!activePodId || !activeItemCode) {
      setError('No saved pod + item yet. Run the flow once, then Resume works.')
      return
    }

    setBusy('resume')
    setError(null)
    stopPolling()
    setDispatch(null)
    setDispatchState(null)
    setDispatchBody(null)
    setPickupQrDataUrl(null)
    setActiveMode(null)

    try {
      setPodId(activePodId)
      onDefaultPodIdChange(activePodId)

      const statusResponse = await request('Fetch pod status', {
        method: 'GET',
        path: `/partner/v1/pods/${encodeURIComponent(activePodId)}/status`,
      })
      if (!statusResponse.ok) {
        throw new Error(`Pod status failed (${statusResponse.status})`)
      }
      setPodStatus(statusResponse.body.trim() || '(empty)')

      const nextItems = await loadItemsForPod(activePodId, {
        preferItemCode: activeItemCode,
        preferModifiers:
          Object.keys(modifierChoices).length > 0
            ? modifierChoices
            : savedFlow.modifierChoices,
      })

      if (!nextItems.some((item) => item.itemCode === activeItemCode)) {
        throw new Error(
          `Saved item ${activeItemCode} not on pod ${activePodId}`
        )
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to resume last brew setup'
      )
    } finally {
      setBusy(null)
    }
  }

  const handleSelectItem = (code: string) => {
    setItemCode(code)
    const item = items.find((entry) => entry.itemCode === code)
    if (item) {
      setModifierChoices(modifiersToChoiceMap(item.modifiers))
      setCompletedThrough((prev) => Math.max(prev, 2))
      setCurrentStep(3)
    }
  }

  const handleModifierChange = (group: string, flag: string) => {
    if (!selectedItem) return

    const nextPreferred = { ...modifierChoices, [group]: flag }
    // Re-resolve so cupSize (etc.) follows temperature requires
    const resolved = selectModifiersFromGroups(
      selectedItem.modifierGroups,
      nextPreferred
    )
    setModifierChoices(modifiersToChoiceMap(resolved))
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

    // Completed orders leave the live dispatch API (410) — read archived history
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
        throw new Error(`Fetch dispatch failed (${response.status})`)
      }
      return null
    }

    let state = parseDispatchState(body)
    try {
      const snap = parseDispatchSnapshot(body)
      state = snap.state
    } catch {
      // keep parseDispatchState fallback
    }

    setDispatchState(state)
    setDispatchBody(body)
    setCompletedThrough(4)
    setCurrentStep(4)

    if (TERMINAL_DISPATCH_STATES.has(state)) {
      stopPolling()
    }

    return state
  }

  const startPolling = (
    activePodId: string,
    orderId: string,
    dispatchMode: 'immediate' | 'pickup' = 'immediate'
  ) => {
    stopPolling()
    pollCountRef.current = 0
    setPolling(true)

    // Pickup waits for machine scan before brewing — allow longer watch window
    const maxAttempts = dispatchMode === 'pickup' ? 150 : 60

    pollTimerRef.current = setInterval(() => {
      pollCountRef.current += 1
      void fetchDispatchOnce(activePodId, orderId, { silent: true }).catch(
        () => {
          // Keep polling; transient errors are fine during brew
        }
      )

      if (pollCountRef.current >= maxAttempts) {
        stopPolling()
        setError(
          dispatchMode === 'pickup'
            ? 'Stopped polling after ~5 minutes — scan the QR at the pod, then refresh'
            : 'Stopped polling after 60 attempts (~2 minutes)'
        )
      }
    }, 2000)
  }

  const handleCreateDispatch = async () => {
    if (!podId) {
      setError('Select a pod first')
      return
    }
    if (!selectedItem) {
      setError('Select an item first')
      return
    }

    setBusy('dispatch')
    setError(null)
    stopPolling()
    // Clear previous order so a second click starts a brand-new dispense
    setDispatch(null)
    setDispatchState(null)
    setDispatchBody(null)
    setPickupQrDataUrl(null)
    setActiveMode(null)

    try {
      const body = buildDispatchBody(selectedItem, {
        lang: FLOW_LANG,
        channel,
        deliveryPort: Number(deliveryPort) || 1,
        displayNote: selectedItem.display || 'Test drink from Kafei admin',
        modifiers: configuredModifiers,
      })

      // Always mint a fresh key — reusing the previous one makes CofePlus
      // return the old "stuck" order instead of creating a new dispense.
      const key = `kafei-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setIdempotencyKey(key)

      const response = await request(
        mode === 'pickup' ? 'Create pickup dispatch' : 'Create dispatch',
        {
          method: 'POST',
          path: `/partner/v1/dispatches/${encodeURIComponent(podId)}`,
          query: { mode },
          headers: {
            'Idempotency-Key': key,
            'Content-Type': 'application/json',
          },
          body,
        }
      )

      if (!response.ok) {
        throw new Error(
          `Create dispatch failed (${response.status}): ${response.body.slice(0, 300)}`
        )
      }

      const created = parseCreateDispatch(response.body)
      setActiveMode(mode)
      setDispatch(created)
      setDispatchState(null)
      setDispatchBody(null)
      setCompletedThrough(3)
      setCurrentStep(4)

      await fetchDispatchOnce(podId, created.id)
      startPolling(podId, created.id, mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create dispatch')
    } finally {
      setBusy(null)
    }
  }

  const handleRefreshDispatch = async () => {
    if (!podId || !dispatch?.id) {
      setError('No dispatch to refresh')
      return
    }

    setBusy('refresh')
    setError(null)
    try {
      await fetchDispatchOnce(podId, dispatch.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispatch')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>End-to-end brew flow</CardTitle>
          <CardDescription>
            Guided path: pods → items → create dispatch → auto-track status.
            Pod, item, modifiers, and dispatch settings are remembered in this
            browser. Use Resume last brew to skip re-selecting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            {steps.map((step) => (
              <StepIndicator
                key={step.id}
                step={step}
                currentStep={currentStep}
                completedThrough={completedThrough}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleResumeLastBrew()}
              disabled={busy !== null || !canResume}
            >
              {busy === 'resume' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Zap />
              )}
              Resume last brew
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFlow}
            >
              <RotateCcw />
              Reset flow
            </Button>
            {polling && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={stopPolling}
              >
                <Square />
                Stop polling
              </Button>
            )}
          </div>
          {canResume && (
            <p className="text-xs text-muted-foreground">
              Last: <code>{podId || savedFlow.podId}</code> ·{' '}
              <code>{itemCode || savedFlow.itemCode}</code> · {mode} ·{' '}
              {channel} · port {deliveryPort}
            </p>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Select pod</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLoadPods}
                  disabled={busy !== null}
                >
                  {busy === 'pods' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Load pods
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCheckPod}
                  disabled={busy !== null || !podId}
                >
                  {busy === 'pod-status' ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  Check status
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pod</Label>
                  {pods.length > 0 ? (
                    <Select
                      value={
                        pods.some((pod) => pod.podId === podId)
                          ? podId
                          : undefined
                      }
                      onValueChange={(value) => {
                        setPodId(value)
                        onDefaultPodIdChange(value)
                        setPodStatus(null)
                        setItems([])
                        setItemCode('')
                        setModifierChoices({})
                        setDispatch(null)
                        setDispatchState(null)
                        setDispatchBody(null)
                        setPickupQrDataUrl(null)
                        setActiveMode(null)
                        stopPolling()
                        setCompletedThrough(0)
                        setCurrentStep(1)
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
                      onChange={(event) => {
                        const value = event.target.value
                        setPodId(value)
                        onDefaultPodIdChange(value)
                      }}
                      placeholder="RCK111"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Machine status</Label>
                  <div className="flex h-9 items-center">
                    {podStatus ? (
                      <Badge
                        variant={
                          podStatus.toUpperCase() === 'OK'
                            ? 'default'
                            : 'destructive'
                        }
                      >
                        {podStatus}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not checked yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Select item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadItems}
                disabled={busy !== null || !podId}
              >
                {busy === 'items' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Load menu
              </Button>
              <p className="text-xs text-muted-foreground">
                Uses <code>/menu</code>. Defaults come from each option&apos;s{' '}
                <code>isDefault</code> (temperature is often hot) — change them
                below after picking a drink. <code>lang={FLOW_LANG}</code>
              </p>

              <div className="space-y-2">
                <Label>Drink</Label>
                <Select
                  value={
                    items.some((item) => item.itemCode === itemCode)
                      ? itemCode
                      : undefined
                  }
                  onValueChange={handleSelectItem}
                  disabled={items.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        items.length ? 'Select a drink…' : 'Load menu first'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {items.map((item) => (
                      <SelectItem key={item.itemCode} value={item.itemCode}>
                        {`${item.category} · ${item.display} — ${item.price}${
                          item.outOfStock ? ' [out of stock]' : ''
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedItem && (
                  <div className="space-y-3">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        <code>{selectedItem.itemCode}</code> · base{' '}
                        {selectedItem.price}
                        {modifierExtraTotal(configuredModifiers) > 0
                          ? ` + mods ${modifierExtraTotal(configuredModifiers)}`
                          : ''}{' '}
                        = <span className="font-medium text-foreground">{configuredTotal}</span>{' '}
                        (minor units)
                      </p>
                    </div>

                    {selectedItem.modifierGroups.length > 0 ? (
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Configure modifiers</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setModifierChoices(
                                modifiersToChoiceMap(selectedItem.modifiers)
                              )
                            }
                          >
                            Reset defaults
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {selectedItem.modifierGroups.map((group) => {
                            const temperatureFlag =
                              modifierChoices.temperature ||
                              configuredModifiers.find(
                                (m) => m.group === 'temperature'
                              )?.flag
                            const options = group.options.filter((option) => {
                              if (!option.requires) return true
                              if (!temperatureFlag) return true
                              if (option.requires.group !== 'temperature') {
                                return true
                              }
                              return option.requires.flags.includes(
                                temperatureFlag
                              )
                            })
                            const value =
                              modifierChoices[group.group] ||
                              options.find((o) => o.isDefault)?.flag ||
                              options[0]?.flag ||
                              ''

                            return (
                              <div key={group.group} className="space-y-1.5">
                                <Label className="text-xs">
                                  {group.display}
                                  <span className="ml-1 text-muted-foreground">
                                    ({group.group})
                                  </span>
                                </Label>
                                <Select
                                  value={value || undefined}
                                  onValueChange={(flag) =>
                                    handleModifierChange(group.group, flag)
                                  }
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue
                                      placeholder={`Select ${group.display}`}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(options.length > 0
                                      ? options
                                      : group.options
                                    ).map((option) => (
                                      <SelectItem
                                        key={option.flag}
                                        value={option.flag}
                                      >
                                        {option.display}
                                        {typeof option.price === 'number' &&
                                        option.price > 0
                                          ? ` (+${option.price})`
                                          : ''}
                                        {option.isDefault ? ' · default' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No configurable modifiers on this item
                      </p>
                    )}
                  </div>
                )}
                {items.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {items.length} drinks available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Create dispatch</CardTitle>
              <CardDescription>
                {mode === 'pickup'
                  ? 'Pickup creates a pending order and returns a pickupCode — we render that as a QR to show at the machine.'
                  : 'Immediate starts brewing on the pod right away.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
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
                      <SelectItem value="pickup">pickup (QR redeem)</SelectItem>
                      <SelectItem value="immediate">immediate (brew now)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select
                    value={channel}
                    onValueChange={(value) =>
                      setChannel(value as 'mobile' | 'on-site')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">mobile</SelectItem>
                      <SelectItem value="on-site">on-site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Delivery port</Label>
                  <Input
                    value={deliveryPort}
                    onChange={(event) => setDeliveryPort(event.target.value)}
                    type="number"
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Input value={FLOW_LANG} readOnly />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleCreateDispatch()}
                  disabled={busy !== null || !selectedItem || !podId}
                >
                  {busy === 'dispatch' ? (
                    <Loader2 className="animate-spin" />
                  ) : mode === 'pickup' ? (
                    <QrCode />
                  ) : (
                    <Play />
                  )}
                  {dispatch
                    ? mode === 'pickup'
                      ? 'Dispense again (new QR)'
                      : 'Dispense again'
                    : mode === 'pickup'
                      ? 'Create pickup order & QR'
                      : 'Create dispatch & track'}
                </Button>
                {dispatch && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFlow}
                    disabled={busy !== null}
                  >
                    <RotateCcw />
                    Clear current order
                  </Button>
                )}
              </div>
              {dispatch && (
                <p className="text-xs text-muted-foreground">
                  Dispense again starts a <strong>new</strong> order with a
                  fresh idempotency key (won&apos;t reuse the stuck one).
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isPickupFlow ? '4. Pickup QR & status' : '4. Live dispatch'}
              </CardTitle>
              <CardDescription>
                {isPickupFlow
                  ? 'Show this QR (pickupCode) at the pod to redeem. Status stays pending until scanned, then polls through making → ready → done.'
                  : 'After create, this panel keeps the order id and polls status every 2s until ready / done / failed.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dispatch ? (
                <>
                  {isPickupFlow && (
                    <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-4">
                      {pickupQrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pickupQrDataUrl}
                          alt={`Pickup QR for ${dispatch.pickupCode}`}
                          width={220}
                          height={220}
                          className="rounded-md bg-white p-2"
                        />
                      ) : (
                        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                          Generating QR…
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">
                          Scan at pod
                        </p>
                        <p className="font-mono text-2xl font-semibold tracking-widest">
                          {dispatch.pickupCode}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Mode</span>
                      <Badge variant="outline">{flowMode}</Badge>
                    </div>
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
                        {polling ? ' · polling' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">Order ID</span>
                      <code className="max-w-[60%] break-all text-right text-xs">
                        {dispatch.id}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Order number</span>
                      <span>{dispatch.orderNumber}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Pickup code</span>
                      <span className="font-medium">{dispatch.pickupCode}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Pod</span>
                      <span>{podId}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshDispatch}
                      disabled={busy !== null}
                    >
                      {busy === 'refresh' ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Refresh now
                    </Button>
                    {!polling && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          startPolling(podId, dispatch.id, flowMode)
                        }
                      >
                        Resume polling
                      </Button>
                    )}
                  </div>

                  {dispatchBody && (
                    <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                      {formatJson(dispatchBody)}
                    </pre>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No dispatch yet. Complete steps 1–3 to create one.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request log</CardTitle>
              <CardDescription>
                Full request/response bodies also print in the Next.js server
                terminal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Actions in this flow will appear here.
                </p>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.ok ? 'secondary' : 'destructive'}>
                        {entry.status}
                      </Badge>
                      <span className="text-sm font-medium">{entry.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.durationMs}ms
                      </span>
                      {entry.environment && (
                        <Badge variant="outline">{entry.environment}</Badge>
                      )}
                      {entry.authSource && (
                        <Badge variant="outline">auth:{entry.authSource}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {entry.at}
                      </span>
                    </div>
                    <code className="block break-all text-xs text-muted-foreground">
                      {entry.detail}
                    </code>
                    {entry.requestBody ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Request body
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap break-all">
                          {formatJson(entry.requestBody)}
                        </pre>
                      </details>
                    ) : null}
                    {entry.body ? (
                      <details className="text-xs" open={!entry.ok}>
                        <summary className="cursor-pointer text-muted-foreground">
                          Response body
                        </summary>
                        <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap break-all">
                          {formatJson(entry.body)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
