import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getSupportTicketById } from '@/app/actions/support'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditTicketForm } from '../edit-ticket-form'

export default async function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ticket = await getSupportTicketById(id)

  if (!ticket) {
    notFound()
  }

  const user = ticket.users

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/dashboard/support">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to support
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{ticket.subject}</h1>
        <p className="text-muted-foreground">Support ticket</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ticket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className="mt-1 capitalize">
                {String(ticket.status).replace('_', ' ')}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">
                {new Date(ticket.created_at).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="font-medium">
                {user?.full_name || user?.email || user?.phone || '—'}
              </p>
              {user?.email ? (
                <p className="text-sm text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Message</p>
              <p className="whitespace-pre-wrap font-medium">{ticket.message}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update status</CardTitle>
          </CardHeader>
          <CardContent>
            <EditTicketForm ticket={ticket} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
