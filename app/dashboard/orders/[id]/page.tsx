import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getOrderById } from '@/app/actions/orders'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatMoney(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(Number(amount))) {
    return '—'
  }
  return `$${Number(amount).toFixed(2)}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString()
}

function statusVariant(status: string) {
  if (status === 'completed' || status === 'ready') {
    return 'default' as const
  }
  if (status === 'cancelled') {
    return 'destructive' as const
  }
  return 'secondary' as const
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let order: Awaited<ReturnType<typeof getOrderById>> = null
  try {
    order = await getOrderById(id)
  } catch (error) {
    console.error('Order detail failed to load:', error)
  }

  if (!order) {
    notFound()
  }

  let couponCode: string | null = null
  let paymentLabel = 'Standard checkout'
  if (order.coupon_id) {
    const supabase = createAdminClient()
    const { data: coupon } = await supabase
      .from('coupons')
      .select('code')
      .eq('id', order.coupon_id)
      .maybeSingle()
    if (coupon?.code) {
      couponCode = coupon.code
      paymentLabel = `Daily coupon (${coupon.code})`
    } else {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('name, code')
        .eq('id', order.coupon_id)
        .maybeSingle()
      if (promo) {
        couponCode = promo.code || promo.name
        paymentLabel = `Promo code (${couponCode})`
      }
    }
  }

  const items = order.order_items || []
  const user = order.users
  const kiosk = order.kiosks

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/dashboard/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to orders
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{order.order_number}</h1>
          <p className="text-muted-foreground">Order details</p>
        </div>
        <Badge variant={statusVariant(order.status)} className="capitalize">
          {String(order.status).replace('_', ' ')}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Date and time</p>
              <p className="font-medium">{formatDateTime(order.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium capitalize">
                {String(order.status).replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="font-medium">{formatMoney(order.total_amount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Promo / coupon</p>
              <p className="font-medium">{couponCode || 'None'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment</p>
              <p className="font-medium">{paymentLabel}</p>
            </div>
            {order.pickup_code ? (
              <div>
                <p className="text-sm text-muted-foreground">Pickup code</p>
                <p className="font-medium font-mono text-sm">
                  {order.pickup_code}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer and kiosk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="font-medium">
                {user?.full_name || user?.email || user?.phone || '—'}
              </p>
              {user?.email ? (
                <p className="text-sm text-muted-foreground">{user.email}</p>
              ) : null}
              {user?.phone ? (
                <p className="text-sm text-muted-foreground">{user.phone}</p>
              ) : null}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kiosk</p>
              <p className="font-medium">{kiosk?.name || '—'}</p>
              <p className="text-sm text-muted-foreground">
                {kiosk?.address || kiosk?.location || ''}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Add-ons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No items on this order.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item: {
                  id: string
                  quantity: number
                  price: number
                  addons?: string[]
                  products?: { name?: string } | null
                }) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.products?.name || 'Unknown product'}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{formatMoney(item.price)}</TableCell>
                    <TableCell>
                      {item.addons && item.addons.length > 0
                        ? item.addons.join(', ')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
