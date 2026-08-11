'use client'

import { useState } from 'react'
import { createPromoCode } from '@/app/actions/promo-codes'
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

export function CreatePromoCodeForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [type, setType] = useState<string>('percent')
  const [appliesToAll, setAppliesToAll] = useState<string>('true')
  const [isActive, setIsActive] = useState<string>('true')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    formData.set('type', type)
    formData.set('applies_to_all_users', appliesToAll)
    formData.set('is_active', isActive)

    const result = await createPromoCode(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  return (
    <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          placeholder="Optional unique code"
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">% Off</SelectItem>
            <SelectItem value="fixed">Fixed Amount</SelectItem>
            <SelectItem value="nth_cup">Nth Cup</SelectItem>
            <SelectItem value="referral">Referral</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="discount_value">
          {type === 'percent'
            ? 'Discount %'
            : type === 'fixed'
              ? 'Discount Amount'
              : type === 'referral'
                ? 'Free Cups'
                : 'Discount Value'}
        </Label>
        <Input
          id="discount_value"
          name="discount_value"
          type="number"
          step="0.01"
          min="0"
          required
          disabled={isLoading}
        />
      </div>
      {type === 'nth_cup' && (
        <div className="space-y-2">
          <Label htmlFor="nth_cup">Nth Cup</Label>
          <Input
            id="nth_cup"
            name="nth_cup"
            type="number"
            min="2"
            defaultValue={2}
            disabled={isLoading}
          />
        </div>
      )}
      {type === 'referral' && (
        <div className="space-y-2">
          <Label htmlFor="referral_threshold">Referral Threshold</Label>
          <Input
            id="referral_threshold"
            name="referral_threshold"
            type="number"
            min="1"
            defaultValue={3}
            disabled={isLoading}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="validity_days">Validity Days</Label>
        <Input
          id="validity_days"
          name="validity_days"
          type="number"
          min="1"
          disabled={isLoading}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="min_amount">Min Amount</Label>
          <Input
            id="min_amount"
            name="min_amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={0}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_discount_amount">Max Discount</Label>
          <Input
            id="max_discount_amount"
            name="max_discount_amount"
            type="number"
            step="0.01"
            min="0"
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="max_redemptions_total">Max Redemptions Total</Label>
          <Input
            id="max_redemptions_total"
            name="max_redemptions_total"
            type="number"
            min="1"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_redemptions_per_user">Max Per User</Label>
          <Input
            id="max_redemptions_per_user"
            name="max_redemptions_per_user"
            type="number"
            min="1"
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="starts_at">Starts At</Label>
          <Input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ends_at">Ends At</Label>
          <Input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="applies_to_all_users">Applies To</Label>
        <Select value={appliesToAll} onValueChange={setAppliesToAll}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">All Users</SelectItem>
            <SelectItem value="false">Specific Users</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {appliesToAll === 'false' && (
        <div className="space-y-2">
          <Label htmlFor="user_ids">User IDs</Label>
          <Textarea
            id="user_ids"
            name="user_ids"
            rows={3}
            placeholder="Comma-separated user UUIDs"
            disabled={isLoading}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="is_active">Status</Label>
        <Select value={isActive} onValueChange={setIsActive}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Promo Code'}
      </Button>
    </form>
  )
}
