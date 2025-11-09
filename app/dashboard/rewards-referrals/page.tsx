import { getReferrals } from '@/app/actions/data'
import { DataTable } from '@/components/tables/data-table'
import { referralColumns } from './columns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function RewardsReferralsPage() {
  const referrals = await getReferrals()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rewards & Referrals</h1>
        <p className="text-muted-foreground">
          Manage referral system and loyalty rewards
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Referral System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Streak: Invite 3 users = 1 week free
            </p>
            <DataTable columns={referralColumns} data={referrals} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loyalty Rewards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Loyalty bonus: Stay 4 months = 1 free month
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              All bonus rules to be confirmed before development.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

