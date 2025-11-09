import { getOrders } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { orderColumns } from './columns'
import { ExportOrdersButton } from './export-button'

export default async function OrdersPage() {
  const orders = await getOrders()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Management</h1>
          <p className="text-muted-foreground">View and manage orders</p>
        </div>
        <ExportOrdersButton orders={orders} />
      </div>

      <DataTable columns={orderColumns} data={orders} searchKey="order_number" />
    </div>
  )
}

