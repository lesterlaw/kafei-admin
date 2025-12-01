'use client'

import { useState } from 'react'
import { updateNotification, deleteNotification } from '@/app/actions/notifications'
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
import { Trash2 } from 'lucide-react'

export function EditNotificationForm({ notification }: { notification: any }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [triggerEvent, setTriggerEvent] = useState<string>(notification.trigger_event || '')
  const [isActive, setIsActive] = useState<string>(notification.is_active ? 'true' : 'false')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    formData.set('trigger_event', triggerEvent)
    formData.set('is_active', isActive)

    const result = await updateNotification(notification.id, formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    await deleteNotification(notification.id)
    window.location.reload()
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
        <Input
          id="title"
          name="title"
          defaultValue={notification.title}
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          rows={4}
          defaultValue={notification.message}
          required
          disabled={isLoading}
        />
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update Notification'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isLoading}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the notification template.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  )
}




