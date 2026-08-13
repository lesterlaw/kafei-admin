'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Product } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteProduct } from '@/app/actions/products'
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
import { EditProductForm } from './edit-product-form'

const ProductActions = ({ product }: { product: Product }) => {
  const handleDelete = async () => {
    await deleteProduct(product.id)
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product information.
            </DialogDescription>
          </DialogHeader>
          <EditProductForm product={product} />
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
              This action cannot be undone. This will permanently delete the product.
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

export const productColumns: ColumnDef<Product>[] = [
  {
    accessorKey: 'image_url',
    header: 'Image',
    cell: ({ row }) => {
      const url = row.original.image_url
      if (!url) {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <img
          src={url}
          alt={row.original.name}
          className="h-10 w-10 rounded object-cover"
        />
      )
    },
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'price',
    header: 'Price',
    cell: ({ row }) => {
      return `$${row.getValue('price')}`
    },
  },
  {
    accessorKey: 'cofeplus_item_code',
    header: 'Item Code',
    cell: ({ row }) => {
      const code = row.original.cofeplus_item_code
      return code ? (
        <code className="text-xs">{code}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
    },
  },
  {
    accessorKey: 'temperature',
    header: 'Temperature',
  },
  {
    accessorKey: 'is_hidden',
    header: 'Status',
    cell: ({ row }) => {
      return (
        <Badge variant={row.getValue('is_hidden') ? 'secondary' : 'default'}>
          {row.getValue('is_hidden') ? (
            <>
              <EyeOff className="mr-1 h-3 w-3" />
              Hidden
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3 w-3" />
              Visible
            </>
          )}
        </Badge>
      )
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      return <ProductActions product={row.original} />
    },
  },
]
