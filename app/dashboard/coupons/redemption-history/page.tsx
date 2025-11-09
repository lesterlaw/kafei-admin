import { getCoupons } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { couponColumns } from '../columns'

export default async function CouponRedemptionHistoryPage() {
  const coupons = await getCoupons()
  const redeemedCoupons = coupons.filter((c: any) => c.is_redeemed)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Coupon Redemption History</h1>
        <p className="text-muted-foreground">
          View all redeemed coupons and QR codes
        </p>
      </div>

      <DataTable columns={couponColumns} data={redeemedCoupons} searchKey="code" />
    </div>
  )
}

