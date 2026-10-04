'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resetOrderForRescan } from '@/app/actions/queue'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export function ResetScanButton({
  orderId,
  compact = false,
  className,
}: {
  orderId: string
  compact?: boolean
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickupCode, setPickupCode] = useState<string | null>(null)

  const handleReset = async () => {
    setBusy(true)
    setError(null)
    const result = await resetOrderForRescan(orderId)
    setBusy(false)
    if (!result.ok) {
      setError(result.error || 'Reset failed')
      return
    }
    setPickupCode(result.pickupCode || null)
    router.refresh()
  }

  return (
    <div className={cn(compact ? 'mt-2' : undefined, className)}>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={compact ? 'outline' : 'default'}
            disabled={busy}
          >
            {busy ? 'Resetting…' : 'Reset scan'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this order for a new scan?</AlertDialogTitle>
            <AlertDialogDescription>
              This keeps the same order, mints a new QR on the customer phone,
              and lets them scan at the kiosk again. It does not start the
              machine until they scan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReset()}>
              Reset scan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {pickupCode ? (
        <p className="mt-2 text-xs text-muted-foreground">
          New QR {pickupCode}. Ask the customer to refresh and scan again.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
