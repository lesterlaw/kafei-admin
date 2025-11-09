'use client'

import { useState } from 'react'
import { createNotification } from '@/app/actions/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CreateNotificationForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [triggerEvent, setTriggerEvent] = useState<string>('')
  const [isActive, setIsActive] = useState<string>('true')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    formData.set('trigger_event', triggerEvent)
    formData.set('is_active', isActive)

    const result = await createNotification(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" rows={4} required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trigger_event">Trigger Event</Label>
        <Select value={triggerEvent} onValueChange={setTriggerEvent}>
          <SelectTrigger>
            <SelectValue placeholder="Select trigger event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="order_placed">Order Placed</SelectItem>
            <SelectItem value="order_completed">Order Completed</SelectItem>
            <SelectItem value="subscription_started">Subscription Started</SelectItem>
            <SelectItem value="subscription_expired">Subscription Expired</SelectItem>
            <SelectItem value="coupon_generated">Coupon Generated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="is_active">Status</Label>
        <Select value={isActive} onValueChange={setIsActive}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Notification'}
      </Button>
    </form>
  )
}

