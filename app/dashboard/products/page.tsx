import { getProducts } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { productColumns } from './columns'
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
import { CreateProductForm } from './create-product-form'

export default async function ProductsPage() {
  const products = await getProducts()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Product Management</h1>
          <p className="text-muted-foreground">Manage coffee products</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/products/add-ons">
            <Button variant="outline">Manage Add-ons</Button>
          </Link>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Product</DialogTitle>
                <DialogDescription>
                  Add a new coffee product to the menu.
                </DialogDescription>
              </DialogHeader>
              <CreateProductForm />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable columns={productColumns} data={products} searchKey="name" />
    </div>
  )
}

