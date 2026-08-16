'use client'

import { useState } from 'react'
import { updateBanner, deleteBanner } from '@/app/actions/banners'
import { Banner } from '@/types/database'
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

export function EditBannerForm({ banner }: { banner: Banner }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActive, setIsActive] = useState<string>(
    banner.is_active ? 'true' : 'false'
  )

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    formData.set('is_active', isActive)

    const result = await updateBanner(banner.id, formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    await deleteBanner(banner.id)
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
        <Label htmlFor="image">Banner Image</Label>
        {banner.image_url ? (
          <img
            src={banner.image_url}
            alt={banner.title || 'Banner'}
            className="h-24 w-full max-w-sm rounded object-cover"
          />
        ) : null}
        <Input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          disabled={isLoading}
        />
        <Input
          id="image_url"
          name="image_url"
          type="url"
          placeholder="Or paste an image URL"
          defaultValue={banner.image_url}
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Upload a new file to replace the current image, or keep the URL.
          Recommended size: 1200×600 px (2:1)
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={banner.title || ''}
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="link_url">Link URL</Label>
        <Input
          id="link_url"
          name="link_url"
          type="url"
          defaultValue={banner.link_url || ''}
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sort_order">Sort Order</Label>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          defaultValue={banner.sort_order}
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update Banner'}
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
                banner.
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
