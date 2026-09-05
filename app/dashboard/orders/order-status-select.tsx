'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrderStatus } from '@/app/actions/orders'
import { cn } from '@/lib/utils'

const ORDER_STATUSES = [
  { value: 'queued', label: 'Queued' },
  { value: 'pending', label: 'Pending (QR ready)' },
  { value: 'brewing', label: 'Brewing' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

interface OrderStatusSelectProps {
  orderId: string
  status: string
  className?: string
}

export function OrderStatusSelect({
  orderId,
  status,
  className,
}: OrderStatusSelectProps) {
  const router = useRouter()
  const [value, setValue] = useState(status || 'pending')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setValue(status || 'pending')
  }, [status])

  const onChange = (next: string) => {
    if (!next || next === value) {
      return
    }
    const previous = value
    setValue(next)
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, next)
      if (result?.error) {
        setValue(previous)
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div
      data-no-row-nav
      className={cn('min-w-[160px]', className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="sr-only" htmlFor={`order-status-${orderId}`}>
        Order status
      </label>
      <select
        id={`order-status-${orderId}`}
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm capitalize shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ORDER_STATUSES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
