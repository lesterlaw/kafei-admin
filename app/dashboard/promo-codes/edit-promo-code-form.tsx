'use client'

import { useState } from 'react'
import { updatePromoCode, deletePromoCode } from '@/app/actions/promo-codes'
import { PromoCode } from '@/types/database'
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

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EditPromoCodeForm({
  promoCode,
  assignedUserIds = '',
}: {
  promoCode: PromoCode
  assignedUserIds?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [type, setType] = useState<string>(promoCode.type)
  const [appliesToAll, setAppliesToAll] = useState<string>(
    promoCode.applies_to_all_users ? 'true' : 'false'
  )
  const [isActive, setIsActive] = useState<string>(
    promoCode.is_active ? 'true' : 'false'
  )

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    formData.set('is_active', isActive)

    if (!promoCode.is_system) {
      formData.set('type', type)
      formData.set('applies_to_all_users', appliesToAll)
    }

    const result = await updatePromoCode(promoCode.id, formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    const result = await deletePromoCode(promoCode.id)
    if (result?.error) {
      setError(result.error)
      return
    }
    window.location.reload()
  }

  if (promoCode.is_system) {
    return (
      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          System promo: {promoCode.name} ({promoCode.code}). Only variable
          fields can be changed.
        </p>
        <div className="space-y-2">
          <Label htmlFor="discount_value">Discount Value</Label>
          <Input
            id="discount_value"
            name="discount_value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={promoCode.discount_value}
            required
            disabled={isLoading}
          />
        </div>
        {promoCode.type === 'nth_cup' && (
          <div className="space-y-2">
            <Label htmlFor="nth_cup">Nth Cup</Label>
            <Input
              id="nth_cup"
              name="nth_cup"
              type="number"
              min="2"
              defaultValue={promoCode.nth_cup ?? 2}
              disabled={isLoading}
            />
          </div>
        )}
        {promoCode.type === 'referral' && (
          <div className="space-y-2">
            <Label htmlFor="referral_threshold">Referral Threshold</Label>
            <Input
              id="referral_threshold"
              name="referral_threshold"
              type="number"
              min="1"
              defaultValue={promoCode.referral_threshold ?? 3}
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
            defaultValue={promoCode.validity_days ?? ''}
            disabled={isLoading}
          />
        </div>
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
          {isLoading ? 'Updating...' : 'Update System Promo'}
        </Button>
      </form>
    )
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
        <Input
          id="name"
          name="name"
          defaultValue={promoCode.name}
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Code</Label>
        <Input
          id="code"
          name="code"
          defaultValue={promoCode.code || ''}
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
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
        <Label htmlFor="discount_value">Discount Value</Label>
        <Input
          id="discount_value"
          name="discount_value"
          type="number"
          step="0.01"
          min="0"
          defaultValue={promoCode.discount_value}
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
            defaultValue={promoCode.nth_cup ?? 2}
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
            defaultValue={promoCode.referral_threshold ?? 3}
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
          defaultValue={promoCode.validity_days ?? ''}
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
            defaultValue={promoCode.min_amount}
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
            defaultValue={promoCode.max_discount_amount ?? ''}
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
            defaultValue={promoCode.max_redemptions_total ?? ''}
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
            defaultValue={promoCode.max_redemptions_per_user ?? ''}
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
            defaultValue={toDatetimeLocal(promoCode.starts_at)}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ends_at">Ends At</Label>
          <Input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(promoCode.ends_at)}
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
            defaultValue={assignedUserIds}
            placeholder="Comma-separated user UUIDs"
            disabled={isLoading}
          />
        </div>
      )}
      {appliesToAll === 'true' && (
        <input type="hidden" name="user_ids" value="" />
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update Promo Code'}
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
                This action cannot be undone. This will permanently delete the
                promo code.
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
