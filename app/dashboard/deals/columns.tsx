'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Deal } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { dealDescriptionText } from '@/lib/deals'
import { formatSingaporeDateTime } from '@/lib/datetime'

export const dealColumns: ColumnDef<Deal>[] = [
  {
    id: 'image',
    header: 'Image',
    accessorFn: (row) => row.image_urls?.[0] || '',
    enableSorting: false,
    cell: ({ row }) => {
      const url = row.original.image_urls?.[0]
      return url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={row.original.title}
          className="h-12 w-24 rounded object-cover"
        />
      ) : (
        <div className="flex h-12 w-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          No image
        </div>
      )
    },
  },
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    id: 'description',
    header: 'Description',
    accessorFn: (row) => dealDescriptionText(row.description),
    cell: ({ getValue }) => (
      <span className="line-clamp-2 max-w-md text-muted-foreground">
        {String(getValue())}
      </span>
    ),
  },
  {
    id: 'images',
    header: 'Images',
    accessorFn: (row) => row.image_urls?.length || 0,
  },
  {
    accessorKey: 'link_url',
    header: 'URL',
    cell: ({ row }) =>
      row.original.link_url ? (
        <a
          href={row.original.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-48 truncate text-primary underline-offset-2 hover:underline"
        >
          {row.original.link_url}
        </a>
      ) : (
        '-'
      ),
  },
  {
    accessorKey: 'sort_order',
    header: 'Sort Order',
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
    accessorKey: 'updated_at',
    header: 'Updated',
    cell: ({ row }) => formatSingaporeDateTime(row.original.updated_at),
  },
]
