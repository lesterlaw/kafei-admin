import { getCoupons } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { couponColumns } from './columns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function CouponsPage() {
  const coupons = await getCoupons()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Coupons</h1>
          <p className="text-muted-foreground">
            Daily Coupons are per-user drink entitlements from a subscription
            (one QR per day). Promo Codes are marketing discounts such as
            NEW10.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/promo-codes">
            <Button variant="outline">Promo Codes</Button>
          </Link>
          <Link href="/dashboard/coupons/redemption-history">
            <Button variant="outline">View Redemption History</Button>
          </Link>
        </div>
      </div>

      <DataTable columns={couponColumns} data={coupons} searchKey="code" />
    </div>
  )
}

