'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveStripeMode, type StripeModeStatus } from '@/app/actions/stripe-mode'
import type { StripeMode } from '@/lib/stripe/mode'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

const MODE_COPY: Record<StripeMode, { label: string; hint: string }> = {
  test: {
    label: 'Test',
    hint: 'No real money moves. Use Stripe test cards.',
  },
  live: {
    label: 'Live',
    hint: 'Customers are charged real money.',
  },
}

export function StripeModeToggle({ status }: { status: StripeModeStatus }) {
  const router = useRouter()
  const [mode, setMode] = useState<StripeMode>(status.mode)
  const [pending, setPending] = useState<StripeMode | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = async (next: StripeMode) => {
    setIsSaving(true)
    setError(null)
    const result = await saveStripeMode(next)
    setIsSaving(false)
    setPending(null)
    if ('error' in result) {
      setError(result.error ?? 'Failed to save Stripe mode')
      return
    }
    setMode(result.mode)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Stripe mode</span>
        <div
          role="radiogroup"
          aria-label="Stripe mode"
          className="inline-flex rounded-md border bg-muted p-1"
        >
          {(['test', 'live'] as StripeMode[]).map((option) => {
            const selected = mode === option
            const configured = status[option].configured
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={isSaving || !configured || selected}
                onClick={() => setPending(option)}
                className={cn(
                  'rounded px-4 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? option === 'live'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white'
                    : 'text-muted-foreground hover:text-foreground',
                  !configured && 'cursor-not-allowed opacity-50'
                )}
              >
                {MODE_COPY[option].label}
              </button>
            )
          })}
        </div>
        <Badge variant={mode === 'live' ? 'default' : 'secondary'}>
          Currently {MODE_COPY[mode].label}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{MODE_COPY[mode].hint}</p>

      <ul className="space-y-1 text-xs text-muted-foreground">
        {(['test', 'live'] as StripeMode[]).map((option) => (
          <li key={option}>
            {MODE_COPY[option].label} keys:{' '}
            {status[option].configured ? 'set' : 'not set on the server'}
            {status[option].configured
              ? status[option].webhook
                ? ', webhook secret set'
                : ', webhook secret missing (renewals will not be recorded)'
              : ''}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        The app picks up the matching publishable key from the server at
        checkout (app version 1.0.21 or later). Plans bought in one mode keep
        billing in that mode.
      </p>

      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch Stripe to {pending ? MODE_COPY[pending].label : ''} mode?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === 'live'
                ? 'Every checkout and subscription from now on will charge real cards.'
                : 'Checkout will stop taking real payments. Only Stripe test cards will work.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault()
                if (pending) void apply(pending)
              }}
            >
              {isSaving ? 'Switching...' : 'Switch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
