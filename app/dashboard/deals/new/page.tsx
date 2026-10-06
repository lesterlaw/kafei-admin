import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DealForm } from '@/app/dashboard/deals/deal-form'

export default function NewDealPage() {
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="-ml-3 mb-2">
          <Link href="/dashboard/deals">Back to deals</Link>
        </Button>
        <h1 className="text-3xl font-bold">Create Deal</h1>
        <p className="text-muted-foreground">
          Add a deal or promotion to the app Deals tab.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Deal details</CardTitle>
        </CardHeader>
        <CardContent>
          <DealForm />
        </CardContent>
      </Card>
    </div>
  )
}
