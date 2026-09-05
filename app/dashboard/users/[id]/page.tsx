import { getUserById } from '@/app/actions/users'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAvailableBeans, resolveMembership } from '@/lib/product-logic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { notFound } from 'next/navigation'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let user: Awaited<ReturnType<typeof getUserById>> = null
  try {
    user = await getUserById(id)
  } catch (error) {
    console.error('User detail failed to load:', error)
  }

  if (!user) {
    notFound()
  }

  const adminClient = createAdminClient()
  let walletSummary: {
    stamps: number
    beans: number
    welcome: boolean
    credit: number
    passActive: string | null
    passPending: string | null
    kind: string
  } | null = null
  let referredBy: {
    id: string
    email: string | null
    full_name: string | null
    referral_code: string
    status: string
    created_at: string
    activated_at: string | null
  } | null = null
  let referredUsers: Array<{
    id: string
    email: string | null
    full_name: string | null
    status: string
    created_at: string
    activated_at: string | null
  }> = []

  try {
    const { membership, wallet } = await resolveMembership(adminClient, id)
    const beans = await getAvailableBeans(adminClient, id)
    walletSummary = {
      stamps: wallet.stamp_count,
      beans,
      welcome: wallet.welcome_drink_available,
      credit: wallet.membership_credit_cents,
      passActive: wallet.pass_active_until,
      passPending: wallet.pass_pending_until,
      kind: membership.kind,
    }
  } catch (error) {
    console.error('Wallet load failed (migration may be pending):', error)
  }

  try {
    const [{ data: inbound }, { data: outbound }] = await Promise.all([
      adminClient
        .from('referrals')
        .select(
          'status, created_at, activated_at, referral_code, referrer:users!referrals_referrer_id_fkey(id, email, full_name)'
        )
        .eq('referred_id', id)
        .maybeSingle(),
      adminClient
        .from('referrals')
        .select(
          'status, created_at, activated_at, referred:users!referrals_referred_id_fkey(id, email, full_name)'
        )
        .eq('referrer_id', id)
        .order('created_at', { ascending: false }),
    ])

    const referrer = inbound?.referrer as
      | { id: string; email: string | null; full_name: string | null }
      | { id: string; email: string | null; full_name: string | null }[]
      | null
    const referrerRow = Array.isArray(referrer) ? referrer[0] : referrer
    if (inbound && referrerRow) {
      referredBy = {
        id: referrerRow.id,
        email: referrerRow.email,
        full_name: referrerRow.full_name,
        referral_code: inbound.referral_code,
        status: inbound.status,
        created_at: inbound.created_at,
        activated_at: inbound.activated_at,
      }
    }

    referredUsers = (outbound || []).map((row) => {
      const referred = row.referred as
        | { id: string; email: string | null; full_name: string | null }
        | { id: string; email: string | null; full_name: string | null }[]
        | null
      const person = Array.isArray(referred) ? referred[0] : referred
      return {
        id: person?.id || '',
        email: person?.email || null,
        full_name: person?.full_name || null,
        status: row.status,
        created_at: row.created_at,
        activated_at: row.activated_at,
      }
    })
  } catch (error) {
    console.error('User referrals failed to load:', error)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Details</h1>
        <p className="text-muted-foreground">View user information and related data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="font-medium">{user.full_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{user.phone || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={user.is_blocked ? 'destructive' : 'default'}>
                {user.is_blocked ? 'Blocked' : 'Active'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Referral Code</p>
              <p className="font-medium">{user.referral_code}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created At</p>
              <p className="font-medium">
                {new Date(user.created_at).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wallet &amp; membership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!walletSummary ? (
              <p className="text-sm text-muted-foreground">
                Wallet unavailable. Apply migration 014_product_logic_mvp.sql.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <p className="font-medium capitalize">{walletSummary.kind}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stamps</p>
                  <p className="font-medium">{walletSummary.stamps}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Beans (unexpired)</p>
                  <p className="font-medium">{walletSummary.beans}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Welcome drink</p>
                  <p className="font-medium">
                    {walletSummary.welcome ? 'Available' : 'Used / not available'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Membership credit</p>
                  <p className="font-medium">
                    ${(walletSummary.credit / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">KAFEI Pass</p>
                  <p className="font-medium text-sm">
                    Active:{' '}
                    {walletSummary.passActive
                      ? new Date(walletSummary.passActive).toLocaleString()
                      : '—'}
                    <br />
                    Pending:{' '}
                    {walletSummary.passPending
                      ? new Date(walletSummary.passPending).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Referrals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">Referred by</p>
            {referredBy ? (
              <p className="font-medium">
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/dashboard/users/${referredBy.id}`}
                >
                  {referredBy.full_name || referredBy.email || referredBy.id}
                </a>
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {referredBy.referral_code} · {referredBy.status} · signed up{' '}
                  {new Date(referredBy.created_at).toLocaleString()}
                  {referredBy.activated_at
                    ? ` · activated ${new Date(referredBy.activated_at).toLocaleString()}`
                    : ''}
                </span>
              </p>
            ) : (
              <p className="font-medium">No referrer</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              Users they referred ({referredUsers.length})
            </p>
            {referredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrals yet.</p>
            ) : (
              <div className="space-y-2">
                {referredUsers.map((row) => (
                  <div
                    key={`${row.id}-${row.created_at}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <a
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      href={row.id ? `/dashboard/users/${row.id}` : undefined}
                    >
                      {row.full_name || row.email || row.id || 'Unknown user'}
                    </a>
                    <p className="text-sm text-muted-foreground">
                      {row.status} · {new Date(row.created_at).toLocaleString()}
                      {row.activated_at
                        ? ` · activated ${new Date(row.activated_at).toLocaleString()}`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
