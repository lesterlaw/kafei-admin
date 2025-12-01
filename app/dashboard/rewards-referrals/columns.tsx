'use client'

import { ColumnDef } from '@tanstack/react-table'

export const referralColumns: ColumnDef<any>[] = [
  {
    accessorKey: 'referrer.email',
    header: 'Referrer',
  },
  {
    accessorKey: 'referred.email',
    header: 'Referred User',
  },
  {
    accessorKey: 'referral_code',
    header: 'Referral Code',
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ row }) => {
      return new Date(row.getValue('created_at')).toLocaleDateString()
    },
  },
]




