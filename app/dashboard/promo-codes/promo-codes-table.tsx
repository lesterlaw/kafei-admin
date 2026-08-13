'use client'

import { DataTable } from '@/components/tables/data-table'
import { PromoCode } from '@/types/database'
import { createPromoCodeColumns } from './columns'

export function PromoCodesTable({
  promoCodes,
  userIdsByPromo,
}: {
  promoCodes: PromoCode[]
  userIdsByPromo: Record<string, string>
}) {
  const columns = createPromoCodeColumns(userIdsByPromo)
  return <DataTable columns={columns} data={promoCodes} searchKey="name" />
}
