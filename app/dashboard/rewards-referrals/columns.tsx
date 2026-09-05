'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export type ReferralRow = {
  id: string
  referrer_id: string
  referred_id: string
  referral_code: string
  status?: string
  activated_at?: string | null
  created_at: string
  referrer?: { email?: string | null; full_name?: string | null } | null
  referred?: { email?: string | null; full_name?: string | null } | null
}

function personLabel(
  person: ReferralRow['referrer'],
  fallbackId: string
) {
  return person?.full_name || person?.email || fallbackId
}

export const referralColumns: ColumnDef<ReferralRow>[] = [
  {
    accessorKey: 'referrer.email',
    header: 'Referrer',
    cell: ({ row }) => (
      <Link
        href={`/dashboard/users/${row.original.referrer_id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {personLabel(row.original.referrer, row.original.referrer_id)}
      </Link>
    ),
  },
  {
    accessorKey: 'referred.email',
    header: 'Referred user',
    cell: ({ row }) => (
      <Link
        href={`/dashboard/users/${row.original.referred_id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {personLabel(row.original.referred, row.original.referred_id)}
      </Link>
    ),
  },
  {
    accessorKey: 'referral_code',
    header: 'Referral code',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = (row.getValue('status') as string) || 'pending'
      const variant =
        status === 'activated_paid'
          ? 'default'
          : status === 'activated_free'
            ? 'secondary'
            : 'outline'
      return <Badge variant={variant}>{status}</Badge>
    },
  },
  {
    accessorKey: 'activated_at',
    header: 'Activated',
    cell: ({ row }) => formatDateTime(row.getValue('activated_at') as string | null),
  },
  {
    accessorKey: 'created_at',
    header: 'Signed up',
    cell: ({ row }) => formatDateTime(row.getValue('created_at') as string),
  },
]
