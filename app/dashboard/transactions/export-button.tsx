'use client'

import { exportToCSV } from '@/lib/utils/csv'
import { Button } from '@/components/ui/button'

export function ExportTransactionsButton({ transactions }: { transactions: any[] }) {
  const handleExport = () => {
    exportToCSV(transactions, 'transactions', [
      { key: 'id', header: 'Transaction ID' },
      { key: 'users.email', header: 'User Email' },
      { key: 'amount', header: 'Amount' },
      { key: 'status', header: 'Status' },
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'created_at', header: 'Created At' },
    ])
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}

