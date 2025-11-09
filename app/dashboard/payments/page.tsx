import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreditCard } from 'lucide-react'

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment Management</h1>
        <p className="text-muted-foreground">
          Configure payment gateway settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Payment Gateway: Stripe
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Supported Payment Methods:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Paynow</li>
              <li>Credit Card</li>
              <li>Debit Card</li>
            </ul>
          </div>
          <div className="pt-4">
            <p className="text-sm text-muted-foreground">
              Note: Transaction fees are handled directly by Stripe.
            </p>
          </div>
          <Button>Configure Stripe Settings</Button>
        </CardContent>
      </Card>
    </div>
  )
}

