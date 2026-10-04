import { getAddOns } from '@/app/actions/products'
import { DataTable } from '@/components/tables/data-table'
import { addonColumns } from './columns'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AddOnForm } from './addon-form'
import { getProducts } from '@/app/actions/data'

export default async function AddOnsPage() {
  const [addons, products] = await Promise.all([getAddOns(), getProducts()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Product Add-ons</h1>
          <p className="text-muted-foreground">
            Choose which machine add-ons the app shows, their display name, and
            extra price. CofePlus sync adds new options but does not overwrite
            your name, price, or visibility.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/products">
            <Button variant="outline">Back to Products</Button>
          </Link>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Add-on
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Add-on</DialogTitle>
                <DialogDescription>
                  Add a manual add-on or tag an existing catalog item to drinks.
                </DialogDescription>
              </DialogHeader>
              <AddOnForm products={products} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable
        columns={addonColumns}
        data={addons}
        searchKey="name"
        exportFilename="add-ons"
        rowHrefBase="/dashboard/products/add-ons"
      />
    </div>
  )
}
