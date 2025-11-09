import { getKiosks } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { kioskColumns } from './columns'
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
import { CreateKioskForm } from './create-kiosk-form'

export default async function KiosksPage() {
  const kiosks = await getKiosks()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kiosk Management</h1>
          <p className="text-muted-foreground">
            View and manage kiosk locations
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Kiosk
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Kiosk</DialogTitle>
              <DialogDescription>
                Add a new kiosk location.
              </DialogDescription>
            </DialogHeader>
            <CreateKioskForm />
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={kioskColumns} data={kiosks} searchKey="name" />
    </div>
  )
}

