'use client'

import { exportToCSV } from '@/lib/utils/csv'
import { Button } from '@/components/ui/button'

export function ExportOrdersButton({ orders }: { orders: any[] }) {
  const handleExport = () => {
    exportToCSV(orders, 'orders', [
      { key: 'order_number', header: 'Order Number' },
      { key: 'users.email', header: 'User Email' },
      { key: 'kiosks.name', header: 'Kiosk' },
      { key: 'status', header: 'Status' },
      { key: 'total_amount', header: 'Amount' },
      { key: 'created_at', header: 'Created At' },
    ])
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}

