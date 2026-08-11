'use client'

import { ColumnDef } from '@tanstack/react-table'
import { PromoCode } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import { deletePromoCode } from '@/app/actions/promo-codes'
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
import { EditPromoCodeForm } from './edit-promo-code-form'

const typeLabels: Record<string, string> = {
  percent: '% Off',
  fixed: 'Fixed',
  nth_cup: 'Nth Cup',
  referral: 'Referral',
}

const PromoCodeActions = ({
  promoCode,
  assignedUserIds,
}: {
  promoCode: PromoCode
  assignedUserIds: string
}) => {
  const handleDelete = async () => {
    const result = await deletePromoCode(promoCode.id)
    if (!result?.error) {
      window.location.reload()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {promoCode.is_system ? 'Edit System Promo' : 'Edit Promo Code'}
            </DialogTitle>
            <DialogDescription>
              {promoCode.is_system
                ? 'Update discount variables for this built-in promo.'
                : 'Update promo code settings.'}
            </DialogDescription>
          </DialogHeader>
          <EditPromoCodeForm
            promoCode={promoCode}
            assignedUserIds={assignedUserIds}
          />
        </DialogContent>
      </Dialog>

      {!promoCode.is_system && (
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
                promo code.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

export function createPromoCodeColumns(
  userIdsByPromo: Record<string, string>
): ColumnDef<PromoCode>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => row.original.code || '—',
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => typeLabels[row.original.type] || row.original.type,
    },
    {
      accessorKey: 'discount_value',
      header: 'Value',
      cell: ({ row }) => {
        const { type, discount_value } = row.original
        if (type === 'percent' || type === 'nth_cup') {
          return `${discount_value}%`
        }
        if (type === 'referral') {
          return `${discount_value} free`
        }
        return `$${discount_value}`
      },
    },
    {
      accessorKey: 'is_system',
      header: 'System',
      cell: ({ row }) =>
        row.original.is_system ? (
          <Badge variant="outline">System</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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
        <PromoCodeActions
          promoCode={row.original}
          assignedUserIds={userIdsByPromo[row.original.id] || ''}
        />
      ),
    },
  ]
}
