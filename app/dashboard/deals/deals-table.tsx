'use client'

import { DataTable } from '@/components/tables/data-table'
import { Deal } from '@/types/database'
import { dealColumns } from './columns'

export function DealsTable({ deals }: { deals: Deal[] }) {
  return (
    <DataTable
      columns={dealColumns}
      data={deals}
      searchPlaceholder="Search deals..."
      exportFilename="deals"
      rowHrefBase="/dashboard/deals"
    />
  )
}
