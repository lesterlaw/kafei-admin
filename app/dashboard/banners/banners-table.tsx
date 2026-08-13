'use client'

import { DataTable } from '@/components/tables/data-table'
import { Banner } from '@/types/database'
import { createBannerColumns } from './columns'

export function BannersTable({ banners }: { banners: Banner[] }) {
  const columns = createBannerColumns(banners)
  return <DataTable columns={columns} data={banners} searchKey="title" />
}
