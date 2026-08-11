import { getPromoCodes } from '@/app/actions/data'
import { createAdminClient } from '@/lib/supabase/admin'
import { DataTable } from '@/components/tables/data-table'
import { createPromoCodeColumns } from './columns'
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
import { PromoCode } from '@/types/database'

export default async function PromoCodesPage() {
  const promoCodes = (await getPromoCodes()) as PromoCode[]

  const supabase = createAdminClient()
  const targetedIds = promoCodes
    .filter((p) => !p.applies_to_all_users)
    .map((p) => p.id)

  const userIdsByPromo: Record<string, string> = {}
  if (targetedIds.length > 0) {
    const { data: assignments } = await supabase
      .from('promo_code_users')
      .select('promo_code_id, user_id')
      .in('promo_code_id', targetedIds)

    for (const row of assignments || []) {
      const prev = userIdsByPromo[row.promo_code_id]
      userIdsByPromo[row.promo_code_id] = prev
        ? `${prev}, ${row.user_id}`
        : row.user_id
    }
  }

  const columns = createPromoCodeColumns(userIdsByPromo)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Promo Codes</h1>
          <p className="text-muted-foreground">
            Manage marketing and system promo codes (separate from daily
            coupons).
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

      <DataTable columns={columns} data={promoCodes} searchKey="name" />
    </div>
  )
}
