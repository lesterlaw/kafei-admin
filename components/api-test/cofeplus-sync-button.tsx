'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { runCofeplusCatalogSync } from '@/app/actions/cofeplus-sync'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CofeplusEnvironment } from '@/lib/cofeplus/config'

/**
 * Compact Sync button for Kiosks / Products pages.
 */
export function CofeplusSyncButton({
  defaultEnvironment = 'test',
  defaultPodId = '',
}: {
  defaultEnvironment?: CofeplusEnvironment
  defaultPodId?: string
}) {
  const [open, setOpen] = useState(false)
  const [environment, setEnvironment] =
    useState<CofeplusEnvironment>(defaultEnvironment)
  const [podId, setPodId] = useState(defaultPodId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await runCofeplusCatalogSync({
        environment,
        podId: podId.trim() || undefined,
        upsertKafeiRecords: true,
      })

      if (!result.ok) {
        setError(result.error || 'Sync failed')
        return
      }

      setMessage(
        `Synced ${result.podsSynced} pods, ${result.itemsSynced} items → ${result.kiosksUpserted} kiosks, ${result.productsUpserted} products`
      )
      window.setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync CofePlus
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync pods & menu</DialogTitle>
          <DialogDescription>
            Pull from CofePlus and upsert Kafei kiosks + products for mobile
            ordering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Environment</Label>
            <Select
              value={environment}
              onValueChange={(value) =>
                setEnvironment(value as CofeplusEnvironment)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Pod (optional)</Label>
            <Input
              value={podId}
              onChange={(event) => setPodId(event.target.value)}
              placeholder="Empty = all pods, or RCK111"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {message && (
            <p className="text-sm text-emerald-700">{message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleSync()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
