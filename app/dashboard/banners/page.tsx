import { getBanners } from '@/app/actions/data'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreateBannerForm } from './create-banner-form'
import { BannersTable } from './banners-table'
import { Banner } from '@/types/database'

export default async function BannersPage() {
  let banners: Banner[] = []
  try {
    banners = (await getBanners()) as Banner[]
  } catch (error) {
    console.error('Banners page failed to load rows:', error)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Banner Management</h1>
          <p className="text-muted-foreground">
            Manage home carousel banners. Recommended image size: 1200×600 px
            (2:1).
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Banner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Banner</DialogTitle>
              <DialogDescription>
                Add a banner image. Use 1200×600 px (2:1) for best results.
              </DialogDescription>
            </DialogHeader>
            <CreateBannerForm />
          </DialogContent>
        </Dialog>
      </div>

      <BannersTable banners={banners} />
    </div>
  )
}
