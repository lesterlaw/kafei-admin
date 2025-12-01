'use client'

import { useState } from 'react'
import { createKiosk } from '@/app/actions/kiosks'
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

export function CreateKioskForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState<string>('true')

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    formData.set('is_active', isActive)

    const result = await createKiosk(formData)

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
        <Label htmlFor="name">Kiosk Name</Label>
        <Input id="name" name="name" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="latitude">Latitude (Optional)</Label>
        <Input
          id="latitude"
          name="latitude"
          type="number"
          step="0.000001"
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="longitude">Longitude (Optional)</Label>
        <Input
          id="longitude"
          name="longitude"
          type="number"
          step="0.000001"
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
        {isLoading ? 'Creating...' : 'Create Kiosk'}
      </Button>
    </form>
  )
}




