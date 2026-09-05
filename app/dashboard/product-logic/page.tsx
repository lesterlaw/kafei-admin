import {
  getProductLogicSettingsAction,
  updateProductLogicSettingsFormAction,
} from '@/app/actions/product-logic'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function ProductLogicPage() {
  const result = await getProductLogicSettingsAction()
  const s = result.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Product Logic</h1>
        <p className="text-muted-foreground">
          Campaign caps and MVP rules from the 25 Aug brief. Change these without
          rebuilding the app.
        </p>
      </div>

      {!result.success || !s ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {result.error ||
                'Settings table missing. Run migration 014_product_logic_mvp.sql'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <form action={updateProductLogicSettingsFormAction} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Stamps &amp; Check-in</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Stamp cost (redeem)" name="stamp_cost" defaultValue={s.stamp_cost} />
              <Field label="Stamp max" name="stamp_max" defaultValue={s.stamp_max} />
              <Field label="Check-in Beans" name="checkin_beans" defaultValue={s.checkin_beans} />
              <Field label="Welcome Beans" name="welcome_beans" defaultValue={s.welcome_beans} />
              <Field
                label="Free Bean expiry (days)"
                name="free_bean_expiry_days"
                defaultValue={s.free_bean_expiry_days}
              />
              <Field
                label="Scan window (seconds)"
                name="scan_window_seconds"
                defaultValue={s.scan_window_seconds}
              />
              <Field
                label="Robot max orders"
                name="robot_max_orders"
                defaultValue={s.robot_max_orders}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bean catalogue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field label="Americano Beans" name="bean_americano" defaultValue={s.bean_americano} />
              <Field label="Latte Beans" name="bean_latte" defaultValue={s.bean_latte} />
              <Field label="$1 Add-on Beans" name="bean_addon" defaultValue={s.bean_addon} />
              <Field
                label="Add-on cash price"
                name="addon_cash_price"
                defaultValue={s.addon_cash_price}
                step="0.01"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Referrals &amp; Pass</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit these on{' '}
                <Link href="/dashboard/rewards-referrals" className="text-primary underline">
                  Rewards &amp; Referrals
                </Link>{' '}
                for a per-type reward editor.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field
                label="Free referral threshold"
                name="free_referral_threshold"
                defaultValue={s.free_referral_threshold}
              />
              <Field label="Free Pass max" name="free_pass_max" defaultValue={s.free_pass_max} />
              <Field
                label="Pass duration (days)"
                name="pass_duration_days"
                defaultValue={s.pass_duration_days}
              />
              <Field
                label="Paid→Free Beans"
                name="paid_free_referral_beans"
                defaultValue={s.paid_free_referral_beans}
              />
              <Field
                label="Paid→Paid Beans"
                name="paid_paid_referral_beans"
                defaultValue={s.paid_paid_referral_beans}
              />
              <Field
                label="Paid referrals for coupon bundle"
                name="paid_referral_credit_threshold"
                defaultValue={s.paid_referral_credit_threshold}
              />
              <Field
                label="Drink coupons per bundle"
                name="paid_referral_drink_coupons"
                defaultValue={s.paid_referral_drink_coupons ?? 10}
              />
              <Field
                label="Add-on coupons per bundle"
                name="paid_referral_addon_coupons"
                defaultValue={s.paid_referral_addon_coupons ?? 10}
              />
              <Field
                label="Referral coupon expiry (days)"
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

          <Button type="submit">Save settings</Button>
        </form>
      )}
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  step,
}: {
  label: string
  name: string
  defaultValue: number
  step?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        step={step || '1'}
        defaultValue={defaultValue}
        required
      />
    </div>
  )
}
