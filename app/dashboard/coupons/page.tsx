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
          <h1 className="text-3xl font-bold">Coupon Management</h1>
          <p className="text-muted-foreground">
            View and manage daily coupons
          </p>
        </div>
        <Link href="/dashboard/coupons/redemption-history">
          <Button variant="outline">View Redemption History</Button>
        </Link>
      </div>

      <DataTable columns={couponColumns} data={coupons} searchKey="code" />
    </div>
  )
}

