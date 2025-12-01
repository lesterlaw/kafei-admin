'use client'

import { useState } from 'react'
import { createProduct } from '@/app/actions/products'
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

export function CreateProductForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [temperature, setTemperature] = useState<string>('')
  const [isHidden, setIsHidden] = useState<string>('false')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    // Add temperature and is_hidden to formData
    formData.set('temperature', temperature)
    formData.set('is_hidden', isHidden)

    const result = await createProduct(formData)

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
        <Label htmlFor="name">Product Name</Label>
        <Input id="name" name="name" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
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
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="temperature">Temperature</Label>
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
        <Label htmlFor="is_hidden">Visibility</Label>
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
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Product'}
      </Button>
    </form>
  )
}




