'use client'

import { useState } from 'react'
import { updateOrderStatus } from '@/app/actions/orders'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
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




