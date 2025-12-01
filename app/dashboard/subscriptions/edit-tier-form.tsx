'use client'

import { useState } from 'react'
import { updateSubscriptionTier, deleteSubscriptionTier } from '@/app/actions/subscriptions'
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
import { SubscriptionTier } from '@/types/database'
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

export function EditSubscriptionTierForm({ tier }: { tier: SubscriptionTier }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [period, setPeriod] = useState<string>(tier.period || 'monthly')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    formData.set('period', period)

    const result = await updateSubscriptionTier(tier.id, formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    await deleteSubscriptionTier(tier.id)
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
        <Label htmlFor="name">Tier Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={tier.name}
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={tier.description || ''}
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={tier.price}
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="period">Billing Period</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger>
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
            <SelectItem value="3year">3 Years</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="coupon_per_day">Coupons Per Day</Label>
        <Input
          id="coupon_per_day"
          name="coupon_per_day"
          type="number"
          min="1"
          defaultValue={tier.coupon_per_day}
          required
          disabled={isLoading}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update Tier'}
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
                This action cannot be undone. This will permanently delete the subscription tier.
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




