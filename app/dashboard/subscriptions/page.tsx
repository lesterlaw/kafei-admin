import { getSubscriptionTiers } from '@/app/actions/subscriptions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreateSubscriptionTierForm } from './create-tier-form'
import { EditSubscriptionTierForm } from './edit-tier-form'

export default async function SubscriptionsPage() {
  const tiers = await getSubscriptionTiers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscription Management</h1>
          <p className="text-muted-foreground">
            Manage subscription tiers (Max 3 tiers)
          </p>
        </div>
        {tiers.length < 3 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Tier
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Subscription Tier</DialogTitle>
                <DialogDescription>
                  Add a new subscription tier.
                </DialogDescription>
              </DialogHeader>
              <CreateSubscriptionTierForm />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.id}>
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-2xl font-bold">${tier.price}</p>
                <p className="text-sm text-muted-foreground">
                  /{tier.period}
                </p>
              </div>
              <p className="text-sm">{tier.description}</p>
              <div>
                <p className="text-sm text-muted-foreground">
                  Coupons per day: {tier.coupon_per_day}
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Subscription Tier</DialogTitle>
                    <DialogDescription>
                      Update subscription tier information.
                    </DialogDescription>
                  </DialogHeader>
                  <EditSubscriptionTierForm tier={tier} />
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

