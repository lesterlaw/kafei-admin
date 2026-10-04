'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  skipQueueAndBrewNow,
  type CofeplusLiveLane,
  type QueueLane,
} from '@/app/actions/queue'
import { ResetScanButton } from '@/app/dashboard/orders/reset-scan-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
function statusVariant(status: string) {
  if (status === 'ready') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'secondary' as const
}

function formatLiveTime(iso: string) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-SG', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function temperatureLabel(flag: string) {
  if (!flag) return '—'
  if (flag === 'hot') return 'Hot'
  if (flag.startsWith('iced')) return 'Iced'
  return flag
}

export function QueueBoard({
  lanes,
  liveLanes,
}: {
  lanes: QueueLane[]
  liveLanes: CofeplusLiveLane[]
}) {
  const router = useRouter()
  const [liveQuery, setLiveQuery] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [router])

  const filteredLiveLanes = liveLanes.map((lane) => {
    const query = liveQuery.trim().toLowerCase()
    if (!query) return lane
    return {
      ...lane,
      items: lane.items.filter((item) =>
        [
          item.drink,
          item.orderNumber,
          item.pickupCode,
          item.state,
          item.temperature,
          item.milk,
          item.id,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      ),
    }
  })

  return (
    <div className="space-y-6">
      {lanes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Kafei orders in queue</CardTitle>
            <CardDescription>
              Customer orders show here when they check out at a linked kiosk.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {lanes.map((lane) => (
        <Card key={lane.key}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>{lane.kioskName}</CardTitle>
              <CardDescription>
                Pod {lane.podId} · {lane.serving.length} at machine ·{' '}
                {lane.waiting.length} waiting
              </CardDescription>
            </div>
            <Badge
              variant={lane.environment === 'live' ? 'destructive' : 'secondary'}
            >
              {lane.environment.toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Now serving</h3>
              {lane.serving.length === 0 ? (
                <p className="text-sm text-muted-foreground">Machine is free.</p>
              ) : (
                <div className="space-y-3">
                  {lane.serving.map((person) => (
                    <QueueRow
                      key={person.id}
                      person={person}
                      showSkip={person.status === 'pending'}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Waiting</h3>
              {lane.waiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody waiting behind.
                </p>
              ) : (
                <div className="space-y-3">
                  {lane.waiting.map((person) => (
                    <QueueRow key={person.id} person={person} showSkip />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">CofePlus live list</h2>
            <p className="text-sm text-muted-foreground">
              What the machine API still has as live. Rows stay here when
              CofePlus never leaves accepted. Kafei will not mark them Done.
            </p>
          </div>
          <Input
            value={liveQuery}
            onChange={(event) => setLiveQuery(event.target.value)}
            placeholder="Search drink, QR, or K number"
            className="sm:max-w-xs"
          />
        </div>
        {filteredLiveLanes.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No linked pods</CardTitle>
              <CardDescription>
                Set a kiosk pod ID to pull the CofePlus live dispatch list.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filteredLiveLanes.map((lane) => (
            <Card key={`live-${lane.key}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>{lane.kioskName}</CardTitle>
                  <CardDescription>
                    Pod {lane.podId} · {lane.items.length} live
                    {lane.error ? ` · ${lane.error}` : ''}
                  </CardDescription>
                </div>
                <Badge
                  variant={lane.environment === 'live' ? 'destructive' : 'secondary'}
                >
                  {lane.environment.toUpperCase()}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {lane.error && lane.items.length === 0 ? (
                  <p className="text-sm text-destructive">{lane.error}</p>
                ) : null}
                {lane.items.length === 0 && !lane.error ? (
                  <p className="text-sm text-muted-foreground">
                    CofePlus live list is empty.
                  </p>
                ) : null}
                {lane.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {item.orderNumber ? `${item.orderNumber} · ` : ''}
                        {item.drink}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {temperatureLabel(item.temperature)}
                        {item.milk
                          ? ` · ${item.milk === 'milk2' ? 'Oat / milk2' : item.milk === 'milk1' ? 'Regular / milk1' : item.milk}`
                          : ''}
                        {item.deliveryPort ? ` · window ${item.deliveryPort}` : ''}
                        {item.pickupCode ? ` · QR ${item.pickupCode}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLiveTime(item.timeCreated)} · {item.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={statusVariant(item.state)}>{item.state}</Badge>
                      {item.isToday ? null : (
                        <p className="mt-2 text-xs text-muted-foreground">Stale</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => router.refresh()}>
          Refresh now
        </Button>
      </div>
    </div>
  )
}

function QueueRow({
  person,
  showSkip = false,
}: {
  person: QueueLane['serving'][number]
  showSkip?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSkip = async () => {
    setBusy(true)
    setError(null)
    const result = await skipQueueAndBrewNow(person.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Skip failed')
      return
    }
    router.refresh()
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/dashboard/orders/${person.id}`} className="min-w-0">
          <p className="font-medium">
            {person.position ? `#${person.position} · ` : ''}
            {person.customerName}
          </p>
          <p className="text-sm text-muted-foreground">
            {person.drink}
            {person.customerPhone ? ` · ${person.customerPhone}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {person.orderNumber}
            {person.deliveryPort ? ` · port ${person.deliveryPort}` : ''}
            {person.pickupCode ? ` · QR ${person.pickupCode}` : ''}
          </p>
        </Link>
        <div className="text-right">
          <Badge variant={statusVariant(person.status)}>{person.status}</Badge>
          <p className="mt-2 text-xs text-muted-foreground">{person.waitLabel}</p>
          {showSkip ? (
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={busy}
              onClick={() => void handleSkip()}
            >
              {busy ? 'Starting…' : 'Skip queue'}
            </Button>
          ) : null}
          {person.status === 'pending' || person.status === 'queued' ? (
            <ResetScanButton orderId={person.id} compact className="mt-2" />
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
