'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Banner } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { deleteBanner, reorderBanners } from '@/app/actions/banners'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EditBannerForm } from './edit-banner-form'

interface BannerActionsProps {
  banner: Banner
  allBanners: Banner[]
}

const BannerActions = ({ banner, allBanners }: BannerActionsProps) => {
  const sorted = [...allBanners].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  )
  const index = sorted.findIndex((b) => b.id === banner.id)

  const handleDelete = async () => {
    await deleteBanner(banner.id)
    window.location.reload()
  }

  const move = async (direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= sorted.length) return

    const next = [...sorted]
    const [item] = next.splice(index, 1)
    next.splice(swapIndex, 0, item)

    const result = await reorderBanners(
      next.map((banner, i) => ({ id: banner.id, sort_order: i }))
    )
    if (!result?.error) {
      window.location.reload()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={index <= 0}
        onClick={() => move('up')}
        aria-label="Move up"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={index < 0 || index >= sorted.length - 1}
        onClick={() => move('down')}
        aria-label="Move down"
      >
        <ArrowDown className="h-4 w-4" />
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Banner</DialogTitle>
            <DialogDescription>Update banner information.</DialogDescription>
          </DialogHeader>
          <EditBannerForm banner={banner} />
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
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
  )
}

export function createBannerColumns(
  allBanners: Banner[]
): ColumnDef<Banner>[] {
  return [
    {
      accessorKey: 'image_url',
      header: 'Image',
      cell: ({ row }) => {
        const url = row.original.image_url
        return (
          <img
            src={url}
            alt={row.original.title || 'Banner'}
            className="h-12 w-24 rounded object-cover"
          />
        )
      },
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => row.original.title || '—',
    },
    {
      accessorKey: 'sort_order',
      header: 'Sort Order',
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <BannerActions banner={row.original} allBanners={allBanners} />
      ),
    },
  ]
}
