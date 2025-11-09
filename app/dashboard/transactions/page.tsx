import { getTransactions } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { transactionColumns } from './columns'
import { ExportTransactionsButton } from './export-button'

export default async function TransactionsPage() {
  const transactions = await getTransactions()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            View subscription transaction history
          </p>
        </div>
        <ExportTransactionsButton transactions={transactions} />
      </div>

      <DataTable
        columns={transactionColumns}
        data={transactions}
        searchKey="id"
      />
    </div>
  )
}

