import { getKiosks } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { kioskColumns } from './columns'
import { Button } from '@/components/ui/button'
import { Download, Plus } from 'lucide-react'
import { KIOSK_APK_PAGE_PATH, KIOSK_APK_VERSION } from '@/lib/kiosk/apk'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreateKioskForm } from './create-kiosk-form'
import { CofeplusSyncButton } from '@/components/api-test/cofeplus-sync-button'
import { getActiveCofeplusEnvironment } from '@/lib/cofeplus/settings'

export default async function KiosksPage() {
  const kiosks = await getKiosks()
  const environment = await getActiveCofeplusEnvironment()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kiosk Management</h1>
          <p className="text-muted-foreground">
            View and manage kiosk locations
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={KIOSK_APK_PAGE_PATH} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download APK {KIOSK_APK_VERSION}
            </a>
          </Button>
          <CofeplusSyncButton defaultEnvironment={environment} />
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
      </div>

      <DataTable
        columns={kioskColumns}
        data={kiosks}
        searchKey="name"
        exportFilename="kiosks"
        rowHrefBase="/dashboard/kiosks"
      />
    </div>
  )
}
