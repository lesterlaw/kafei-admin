import { getReferrals } from '@/app/actions/data'
import {
  getProductLogicSettingsAction,
  updateProductLogicSettingsFormAction,
} from '@/app/actions/product-logic'
import { DataTable } from '@/components/tables/data-table'
import { referralColumns } from './columns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function RewardsReferralsPage() {
  const [referrals, settingsResult] = await Promise.all([
    getReferrals().catch(() => []),
    getProductLogicSettingsAction(),
  ])
  const s = settingsResult.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rewards &amp; Referrals</h1>
          <p className="text-muted-foreground">
            A referral counts only after the invited user verifies their account
            and completes a first successful drink. Paid referrals also need a
            successful subscription payment.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/referrals">View referrals</Link>
        </Button>
      </div>

      {!settingsResult.success || !s ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {settingsResult.error ||
                'Settings table missing. Run migration 014_product_logic_mvp.sql'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <form action={updateProductLogicSettingsFormAction} className="space-y-6">
          <input type="hidden" name="stamp_cost" value={s.stamp_cost} />
          <input type="hidden" name="stamp_max" value={s.stamp_max} />
          <input type="hidden" name="checkin_beans" value={s.checkin_beans} />
          <input type="hidden" name="welcome_beans" value={s.welcome_beans} />
          <input
            type="hidden"
            name="free_bean_expiry_days"
            value={s.free_bean_expiry_days}
          />
          <input
            type="hidden"
            name="scan_window_seconds"
            value={s.scan_window_seconds}
          />
          <input type="hidden" name="robot_max_orders" value={s.robot_max_orders} />
          <input type="hidden" name="bean_americano" value={s.bean_americano} />
          <input type="hidden" name="bean_latte" value={s.bean_latte} />
          <input type="hidden" name="bean_addon" value={s.bean_addon} />
          <input type="hidden" name="addon_cash_price" value={s.addon_cash_price} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Free referrer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  3 activated referrals grant 1× 7-Day KAFEI Pass (All Drinks, 1
                  coupon / 24h). Max 2 Passes. 1 active + 1 pending.
                </p>
                <Field
                  label="Activated referrals for 1 Pass"
                  name="free_referral_threshold"
                  defaultValue={s.free_referral_threshold}
                />
                <Field
                  label="Pass duration (days)"
                  name="pass_duration_days"
                  defaultValue={s.pass_duration_days}
                />
                <Field
                  label="Max Passes in campaign"
                  name="free_pass_max"
                  defaultValue={s.free_pass_max}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paid referrer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Every 3 new Paid subscribers (Monthly or Annual, same count)
                  grant 10 Latte/Americano drink coupons and 10 add-on coupons
                  (extra shot, oat milk, or latte art). Coupons expire after 90
                  days. Add-on coupons can be used on the daily coupon drink.
                  Repeatable, no cap for phase 1. Beans are no longer awarded
                  for referrals.
                </p>
                <input type="hidden" name="paid_free_referral_beans" value={0} />
                <input type="hidden" name="paid_paid_referral_beans" value={0} />
                <Field
                  label="Paid referrals for coupon bundle"
                  name="paid_referral_credit_threshold"
                  defaultValue={s.paid_referral_credit_threshold}
                />
                <Field
                  label="Drink coupons (Latte/Americano)"
                  name="paid_referral_drink_coupons"
                  defaultValue={s.paid_referral_drink_coupons ?? 10}
                />
                <Field
                  label="Add-on coupons"
                  name="paid_referral_addon_coupons"
                  defaultValue={s.paid_referral_addon_coupons ?? 10}
                />
                <Field
                  label="Coupon expiry (days)"
                  name="paid_referral_coupon_expiry_days"
                  defaultValue={s.paid_referral_coupon_expiry_days ?? 90}
                />
                <input
                  type="hidden"
                  name="membership_credit_cents"
                  value={s.membership_credit_cents}
                />
              </CardContent>
            </Card>
          </div>

          <Button type="submit">Save referral rewards</Button>
        </form>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Referral ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={referralColumns}
            data={referrals}
            searchKey="referral_code"
            searchPlaceholder="Search referrals..."
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string
  name: string
  defaultValue: number
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        step="1"
        defaultValue={defaultValue}
        required
      />
    </div>
  )
}
