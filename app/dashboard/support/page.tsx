import { getSupportTickets } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { ticketColumns } from './columns'

export default async function SupportPage() {
  let tickets: Awaited<ReturnType<typeof getSupportTickets>> = []
  try {
    tickets = await getSupportTickets()
  } catch (error) {
    console.error('Support page failed to load rows:', error)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support Tickets</h1>
        <p className="text-muted-foreground">
          Manage customer support tickets
        </p>
      </div>

      <DataTable
        columns={ticketColumns}
        data={tickets}
        searchKey="subject"
        getRowHref={(ticket) => `/dashboard/support/${ticket.id}`}
      />
    </div>
  )
}
