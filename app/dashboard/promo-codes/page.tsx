import { getPromoCodes } from '@/app/actions/data'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreatePromoCodeForm } from './create-promo-code-form'
import { PromoCodesTable } from './promo-codes-table'
import { PromoCode } from '@/types/database'

export default async function PromoCodesPage() {
  let promoCodes: PromoCode[] = []
  try {
    promoCodes = (await getPromoCodes()) as PromoCode[]
  } catch (error) {
    console.error('Promo codes page failed to load rows:', error)
  }

  const userIdsByPromo: Record<string, string> = {}
  const targetedIds = promoCodes
    .filter((p) => !p.applies_to_all_users)
    .map((p) => p.id)

  if (targetedIds.length > 0) {
    try {
      const supabase = createAdminClient()
      const { data: assignments, error } = await supabase
        .from('promo_code_users')
        .select('promo_code_id, user_id')
        .in('promo_code_id', targetedIds)

      if (!error) {
        for (const row of assignments || []) {
          const prev = userIdsByPromo[row.promo_code_id]
          userIdsByPromo[row.promo_code_id] = prev
            ? `${prev}, ${row.user_id}`
            : row.user_id
        }
      }
    } catch (error) {
      console.error('Promo code user assignments failed to load:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Promo Codes</h1>
          <p className="text-muted-foreground">
            Marketing discount codes customers enter at checkout (for example
            NEW10). Daily Coupons are separate subscription entitlements.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Promo Code
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Promo Code</DialogTitle>
              <DialogDescription>
                Add a marketing promo code for discounts or rewards.
              </DialogDescription>
            </DialogHeader>
            <CreatePromoCodeForm />
          </DialogContent>
        </Dialog>
      </div>

      <PromoCodesTable
        promoCodes={promoCodes}
        userIdsByPromo={userIdsByPromo}
      />
    </div>
  )
}
