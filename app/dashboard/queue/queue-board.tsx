'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { skipQueueAndBrewNow, type QueueLane } from '@/app/actions/queue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

export function QueueBoard({ lanes }: { lanes: QueueLane[] }) {
  const router = useRouter()

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh()
    }, 8000)
    return () => window.clearInterval(timer)
  }, [router])

  if (lanes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No one in queue</CardTitle>
          <CardDescription>
            Machine orders appear here when a customer checks out at a linked
            kiosk.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
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
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
