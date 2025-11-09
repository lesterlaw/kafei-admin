import { getSupportTickets } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { ticketColumns } from './columns'

export default async function SupportPage() {
  const tickets = await getSupportTickets()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground">
          Manage customer support tickets
        </p>
      </div>

      <DataTable columns={ticketColumns} data={tickets} searchKey="subject" />
    </div>
  )
}

