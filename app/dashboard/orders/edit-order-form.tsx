'use client'

import { useState } from 'react'
import { updateOrderStatus } from '@/app/actions/orders'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function EditOrderForm({ order }: { order: any }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<string>(order.status || 'pending')

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    const result = await updateOrderStatus(order.id, status)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="status">Order Status</Label>
        <select
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="queued">Queued</option>
          <option value="pending">Pending (QR ready)</option>
          <option value="brewing">Brewing</option>
          <option value="ready">Ready</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={isLoading}
        onClick={handleSubmit}
      >
        {isLoading ? 'Updating...' : 'Update Status'}
      </Button>
    </div>
  )
}




