'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export const transactionColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'id',
    header: 'Transaction ID',
    cell: ({ row }) => {
      return (
        <Link
          href={`/dashboard/transactions/${row.original.id}`}
          className="text-primary hover:underline"
        >
          {row.original.id.slice(0, 8)}...
        </Link>
      )
    },
  },
  {
    accessorKey: 'users.email',
    header: 'User',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      return `$${row.getValue('amount')}`
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return (
        <Badge variant={status === 'success' ? 'default' : 'destructive'}>
          {status}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'payment_method',
    header: 'Payment Method',
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ row }) => {
      return new Date(row.getValue('created_at')).toLocaleString()
    },
  },
]

