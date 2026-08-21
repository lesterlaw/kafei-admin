import Link from 'next/link'
import { getOrders } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { orderColumns } from './columns'
import { ExportOrdersButton } from './export-button'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  let orders: Awaited<ReturnType<typeof getOrders>> = []
  try {
    orders = await getOrders()
  } catch (error) {
    console.error('Orders page failed to load rows:', error)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground">View and manage orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/queue">Machine queue</Link>
          </Button>
          <ExportOrdersButton orders={orders} />
        </div>
      </div>

      <DataTable
        columns={orderColumns}
        data={orders}
        searchKey="order_number"
        rowHrefBase="/dashboard/orders"
      />
    </div>
  )
}
