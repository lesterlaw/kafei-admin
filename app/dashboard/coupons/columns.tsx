'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { deleteCoupon } from '@/app/actions/coupons'
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

const CouponActions = ({ coupon }: { coupon: any }) => {
  const handleDelete = async () => {
    await deleteCoupon(coupon.id)
    window.location.reload()
  }

  return (
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
            This action cannot be undone. This will permanently delete the coupon.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const couponColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'code',
    header: 'Coupon Code',
  },
  {
    accessorKey: 'users.email',
    header: 'User',
  },
  {
    accessorKey: 'is_redeemed',
    header: 'Status',
    cell: ({ row }) => {
      return (
        <Badge variant={row.getValue('is_redeemed') ? 'default' : 'secondary'}>
          {row.getValue('is_redeemed') ? 'Redeemed' : 'Active'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'expires_at',
    header: 'Expires At',
    cell: ({ row }) => {
      return new Date(row.getValue('expires_at')).toLocaleString()
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created At',
    cell: ({ row }) => {
      return new Date(row.getValue('created_at')).toLocaleDateString()
    },
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      return <CouponActions coupon={row.original} />
    },
  },
]

