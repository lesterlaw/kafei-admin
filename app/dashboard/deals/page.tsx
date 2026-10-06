import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getDeals } from '@/app/actions/deals'
import { Button } from '@/components/ui/button'
import { Deal } from '@/types/database'
import { DealsTable } from './deals-table'

export default async function DealsPage() {
  let deals: Deal[] = []
  try {
    deals = await getDeals()
  } catch (error) {
    console.error('Deals page failed to load rows:', error)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deals & Promotions</h1>
          <p className="text-muted-foreground">
            Manage what customers see on the Deals tab in the app. Click a row
            to edit it.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/deals/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Deal
          </Link>
        </Button>
      </div>

      <DealsTable deals={deals} />
    </div>
  )
}
