'use client'

import { useState } from 'react'
import { createAddOn, updateAddOn } from '@/app/actions/products'
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
import { cn } from '@/lib/utils'

type ProductOption = {
  id: string
  name: string
}

type AddonValue = {
  id?: string
  name?: string
  description?: string | null
  price?: number
  temperature?: string | null
  is_hidden?: boolean
  product_addons?: { product_id: string }[] | null
}

interface AddOnFormProps {
  products: ProductOption[]
  addon?: AddonValue
}

export function AddOnForm({ products, addon }: AddOnFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [temperature, setTemperature] = useState(addon?.temperature || 'both')
  const [isHidden, setIsHidden] = useState(addon?.is_hidden ? 'true' : 'false')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    (addon?.product_addons || []).map((link) => link.product_id)
  )

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    )
  }

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    formData.set('temperature', temperature)
    formData.set('is_hidden', isHidden)
    formData.delete('product_ids')
    for (const productId of selectedProductIds) {
      formData.append('product_ids', productId)
    }

    const result = addon?.id
      ? await updateAddOn(addon.id, formData)
      : await createAddOn(formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    window.location.href = '/dashboard/products/add-ons'
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={addon?.name || ''}
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
          defaultValue={addon?.description || ''}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">Additional price</Label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={addon?.price ?? 0}
          required
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Extra amount charged on top of the drink.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Temperature</Label>
        <Select value={temperature} onValueChange={setTemperature}>
          <SelectTrigger>
            <SelectValue placeholder="Select temperature" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Visibility in app</Label>
        <Select value={isHidden} onValueChange={setIsHidden}>
          <SelectTrigger>
            <SelectValue placeholder="Select visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Visible</SelectItem>
            <SelectItem value="true">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Show on products</Label>
        <p className="text-xs text-muted-foreground">
          Leave all unchecked to show this add-on on every drink. Check specific
          products to limit it.
        </p>
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            products.map((product) => {
              const checked = selectedProductIds.includes(product.id)
              return (
                <label
                  key={product.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    checked && 'bg-muted'
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    onChange={() => toggleProduct(product.id)}
                    disabled={isLoading}
                  />
                  {product.name}
                </label>
              )
            })
          )}
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Saving...' : addon?.id ? 'Save add-on' : 'Create add-on'}
      </Button>
    </form>
  )
}
