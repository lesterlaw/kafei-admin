import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDealById } from '@/app/actions/deals'
import { DealForm } from '@/app/dashboard/deals/deal-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSingaporeDateTime } from '@/lib/datetime'

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let deal: Awaited<ReturnType<typeof getDealById>> = null
  try {
    deal = await getDealById(id)
  } catch {
    deal = null
  }

  if (!deal) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-2">
            <Link href="/dashboard/deals">Back to deals</Link>
          </Button>
          <h1 className="text-3xl font-bold">{deal.title}</h1>
          <p className="text-muted-foreground">
            Last updated {formatSingaporeDateTime(deal.updated_at)}
          </p>
        </div>
        <Badge variant={deal.is_active ? 'default' : 'secondary'}>
          {deal.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Deal details</CardTitle>
        </CardHeader>
        <CardContent>
          <DealForm deal={deal} />
        </CardContent>
      </Card>
    </div>
  )
}
