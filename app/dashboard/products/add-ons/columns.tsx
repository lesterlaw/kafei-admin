'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff } from 'lucide-react'

type AddonRow = {
  id: string
  name: string
  description?: string | null
  price: number
  temperature?: string | null
  is_hidden: boolean
  source?: string | null
  cofeplus_group?: string | null
  cofeplus_flag?: string | null
  product_addons?: { product_id: string }[] | null
}

export const addonColumns: ColumnDef<AddonRow>[] = [
  {
    accessorKey: 'name',
    header: 'Display name',
  },
  {
    accessorKey: 'price',
    header: 'Extra price',
    cell: ({ row }) => {
      const price = Number(row.getValue('price') || 0)
      return price === 0 ? 'Free' : `$${price.toFixed(2)}`
    },
  },
  {
    accessorKey: 'source',
    header: 'Source',
    cell: ({ row }) => {
      const source = row.original.source || 'manual'
      return (
        <Badge variant={source === 'cofeplus' ? 'default' : 'secondary'}>
          {source === 'cofeplus' ? 'CofePlus' : 'Manual'}
        </Badge>
      )
    },
  },
  {
    id: 'machine',
    header: 'Machine flag',
    cell: ({ row }) => {
      const group = row.original.cofeplus_group
      const flag = row.original.cofeplus_flag
      if (!group || !flag) {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <code className="text-xs">
          {group}/{flag}
        </code>
      )
    },
  },
  {
    id: 'products',
    header: 'Tagged products',
    cell: ({ row }) => {
      const count = row.original.product_addons?.length || 0
      return count === 0 ? 'All products' : `${count} product${count === 1 ? '' : 's'}`
    },
  },
  {
    accessorKey: 'is_hidden',
    header: 'Status',
    cell: ({ row }) => {
      const hidden = Boolean(row.getValue('is_hidden'))
      return (
        <Badge variant={hidden ? 'secondary' : 'default'}>
          {hidden ? (
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
]
