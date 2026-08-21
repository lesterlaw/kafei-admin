'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  getLatestCofeplusSyncRun,
  getSyncedCofeplusMenuItems,
  getSyncedCofeplusPods,
  runCofeplusCatalogSync,
} from '@/app/actions/cofeplus-sync'
import {
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

interface SyncRun {
  id: string
  environment: string
  pod_id: string | null
  pods_synced: number
  items_synced: number
  kiosks_upserted: number
  products_upserted: number
  status: string
  error: string | null
  created_at: string
}

interface SyncedPod {
  pod_id: string
  display: string
  synced_at: string
}

interface SyncedItem {
  id: string
  pod_id: string
  item_code: string
  display: string
  category: string | null
  price: number
  out_of_stock: boolean
}

export function CofeplusSyncPanel({
  environment,
  defaultPodId = '',
}: {
  environment: CofeplusEnvironment
  defaultPodId?: string
}) {
  const [podId, setPodId] = useState(
    suggestPodForEnvironment(environment, defaultPodId)
  )
  const [upsertKafei, setUpsertKafei] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<SyncRun | null>(null)
  const [pods, setPods] = useState<SyncedPod[]>([])
  const [items, setItems] = useState<SyncedItem[]>([])

  const loadCached = async (env: CofeplusEnvironment, filterPod = podId) => {
    try {
      const [run, syncedPods, syncedItems] = await Promise.all([
        getLatestCofeplusSyncRun(env),
        getSyncedCofeplusPods(env),
        getSyncedCofeplusMenuItems({
          environment: env,
          podId: filterPod || undefined,
        }),
      ])
      setLastRun((run as SyncRun | null) || null)
      setPods((syncedPods as SyncedPod[]) || [])
      setItems((syncedItems as SyncedItem[]) || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load synced data')
    }
  }

  useEffect(() => {
    const nextPod = suggestPodForEnvironment(environment, defaultPodId)
    setPodId(nextPod)
    void loadCached(environment, nextPod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment, defaultPodId])

  const handleSync = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await runCofeplusCatalogSync({
        environment,
        podId: podId.trim() || undefined,
        upsertKafeiRecords: upsertKafei,
      })

      if (!result.ok) {
        setError(result.error || 'Sync failed')
      }

      await loadCached(environment, podId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync pods & menu</CardTitle>
        <CardDescription>
          Pull CofePlus pods and drinks, save them for API calls, and optionally
          upsert Kafei kiosks (<code>pod_id</code>) + products (
          <code>cofeplus_item_code</code>) so the mobile app can order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <div className="space-y-2">
            <Label>Pod filter (optional)</Label>
            <Input
              value={podId}
              onChange={(event) => setPodId(event.target.value)}
              placeholder={
                environment === 'live'
                  ? 'Leave empty to sync all pods, or e.g. RCK541'
                  : 'Leave empty to sync all pods, or e.g. RCK111'
              }
              list="synced-pod-options"
            />
            <datalist id="synced-pod-options">
              {pods.map((pod) => (
                <option key={pod.pod_id} value={pod.pod_id}>
                  {pod.display}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Map into Kafei</Label>
            <Select
              value={upsertKafei ? 'yes' : 'no'}
              onValueChange={(value) => setUpsertKafei(value === 'yes')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes (kiosks + products)</SelectItem>
                <SelectItem value="no">Cache only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => void handleSync()} disabled={busy}>
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Sync now
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={environment === 'live' ? 'destructive' : 'secondary'}>
            {environment.toUpperCase()}
          </Badge>
          {lastRun ? (
            <>
              <Badge
                variant={lastRun.status === 'success' ? 'default' : 'destructive'}
              >
                {lastRun.status === 'success' ? (
                  <CheckCircle2 className="mr-1 size-3" />
                ) : (
                  <AlertCircle className="mr-1 size-3" />
                )}
                last {lastRun.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(lastRun.created_at).toLocaleString()} · pods{' '}
                {lastRun.pods_synced} · items {lastRun.items_synced} · kiosks{' '}
                {lastRun.kiosks_upserted} · products {lastRun.products_upserted}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              No sync run yet for this environment
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">
              Saved pods ({pods.length})
            </p>
            <div className="max-h-40 space-y-1 overflow-auto text-xs">
              {pods.length === 0 ? (
                <p className="text-muted-foreground">None yet — hit Sync now.</p>
              ) : (
                pods.map((pod) => (
                  <button
                    key={pod.pod_id}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-muted"
                    onClick={() => {
                      setPodId(pod.pod_id)
                      void loadCached(environment, pod.pod_id)
                    }}
                  >
                    <span>
                      <code>{pod.pod_id}</code> · {pod.display}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(pod.synced_at).toLocaleDateString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">
              Saved menu items ({items.length})
              {podId ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · filtered {podId}
                </span>
              ) : null}
            </p>
            <div className="max-h-40 space-y-1 overflow-auto text-xs">
              {items.length === 0 ? (
                <p className="text-muted-foreground">None yet — hit Sync now.</p>
              ) : (
                items.slice(0, 80).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1"
                  >
                    <span className="truncate">
                      {item.display}
                      <span className="text-muted-foreground">
                        {' '}
                        · <code>{item.item_code}</code>
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {item.price}
                      {item.out_of_stock ? ' · OOS' : ''}
                    </span>
                  </div>
                ))
              )}
              {items.length > 80 && (
                <p className="px-2 text-muted-foreground">
                  +{items.length - 80} more
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
