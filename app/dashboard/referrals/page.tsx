import { getReferrals } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { referralColumns, type ReferralRow } from '../rewards-referrals/columns'
import { ExportReferralsButton } from './export-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default async function ReferralsPage() {
  const referrals = (await getReferrals().catch(() => [])) as ReferralRow[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Referrals</h1>
          <p className="text-muted-foreground">
            Who referred whom, when they signed up, and when the referral
            activated after the first drink.
          </p>
        </div>
        <ExportReferralsButton referrals={referrals} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={referralColumns}
            data={referrals}
            searchKey="referral_code"
            searchPlaceholder="Search referrer, referred, or code..."
            rowHrefBase="/dashboard/users"
            rowHrefIdKey="referred_id"
          />
        </CardContent>
      </Card>
    </div>
  )
}
