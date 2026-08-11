'use client'

import { useState } from 'react'
import { createBanner } from '@/app/actions/banners'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function CreateBannerForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState<string>('true')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    formData.set('is_active', isActive)

    const result = await createBanner(formData)

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
        <Label htmlFor="image_url">Image URL</Label>
        <Input
          id="image_url"
          name="image_url"
          type="url"
          placeholder="https://..."
          required
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Recommended size: 1200×600 px (2:1)
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="link_url">Link URL</Label>
        <Input
          id="link_url"
          name="link_url"
          type="url"
          placeholder="https://... (optional)"
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sort_order">Sort Order</Label>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          defaultValue={0}
          disabled={isLoading}
        />
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
        {isLoading ? 'Creating...' : 'Create Banner'}
      </Button>
    </form>
  )
}
