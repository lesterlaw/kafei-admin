'use client'

import { exportToCSV } from '@/lib/utils/csv'
import { Button } from '@/components/ui/button'
import type { ReferralRow } from '../rewards-referrals/columns'

export function ExportReferralsButton({
  referrals,
}: {
  referrals: ReferralRow[]
}) {
  const handleExport = () => {
    const rows = referrals.map((row) => ({
      referrer: row.referrer?.email || row.referrer_id,
      referred: row.referred?.email || row.referred_id,
      referral_code: row.referral_code,
      status: row.status || 'pending',
      activated_at: row.activated_at || '',
      signed_up: row.created_at,
    }))
    exportToCSV(rows, 'referrals', [
      { key: 'referrer', header: 'Referrer' },
      { key: 'referred', header: 'Referred user' },
      { key: 'referral_code', header: 'Referral code' },
      { key: 'status', header: 'Status' },
      { key: 'activated_at', header: 'Activated' },
      { key: 'signed_up', header: 'Signed up' },
    ])
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}
