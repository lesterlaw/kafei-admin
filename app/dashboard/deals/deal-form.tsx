'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import {
  createDeal,
  deleteDeal,
  updateDeal,
  type DealInput,
} from '@/app/actions/deals'
import { Deal } from '@/types/database'
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
import { DealImageUploader } from './deal-image-uploader'
import { DealDescriptionEditor } from './deal-description-editor'

export function DealForm({ deal }: { deal?: Deal }) {
  const router = useRouter()
  const [title, setTitle] = useState(deal?.title || '')
  const [description, setDescription] = useState(deal?.description || '')
  const [imageUrls, setImageUrls] = useState<string[]>(deal?.image_urls || [])
  const [linkUrl, setLinkUrl] = useState(deal?.link_url || '')
  const [sortOrder, setSortOrder] = useState(String(deal?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(deal?.is_active === false ? 'false' : 'true')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    setSaved(false)

    const input: DealInput = {
      title,
      description,
      image_urls: imageUrls,
      link_url: linkUrl,
      sort_order: Number.parseInt(sortOrder, 10) || 0,
      is_active: isActive === 'true',
    }

    const result = deal ? await updateDeal(deal.id, input) : await createDeal(input)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    if (deal) {
      setSaved(true)
      setIsLoading(false)
      router.refresh()
    } else {
      router.push('/dashboard/deals')
      router.refresh()
    }
  }

  const handleDelete = async () => {
    if (!deal) return
    setIsLoading(true)
    const result = await deleteDeal(deal.id)
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }
    router.push('/dashboard/deals')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          Deal saved.
        </div>
      )}

      <div className="space-y-2">
        <Label>Images (up to 3)</Label>
        <DealImageUploader
          value={imageUrls}
          onChange={setImageUrls}
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">
          Recommended size: 1200×600 px (2:1). The first image is shown first in
          the app.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <DealDescriptionEditor
          id="description"
          initialHtml={deal?.description || ''}
          onChange={setDescription}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="link_url">URL</Label>
        <Input
          id="link_url"
          type="url"
          placeholder="https://... (optional, opens when the deal is tapped)"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sort_order">Sort Order</Label>
          <Input
            id="sort_order"
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="is_active">Status</Label>
          <Select value={isActive} onValueChange={setIsActive}>
            <SelectTrigger id="is_active">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={isLoading}>
          {isLoading ? 'Saving...' : deal ? 'Save Deal' : 'Create Deal'}
        </Button>
        {deal ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={isLoading}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  deal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  )
}
