import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getOrderById } from '@/app/actions/orders'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { OrderStatusSelect } from '../order-status-select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return asRecord(value[0])
  }
  return asRecord(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

async function loadCouponLabel(couponId: unknown) {
  if (typeof couponId !== 'string' || !couponId) {
    return { couponCode: null as string | null, paymentLabel: 'Standard checkout' }
  }

  try {
    const supabase = createAdminClient()
    const { data: coupon } = await supabase
      .from('coupons')
      .select('code')
      .eq('id', couponId)
      .maybeSingle()
    if (coupon?.code) {
      return {
        couponCode: coupon.code as string,
        paymentLabel: `Daily coupon (${coupon.code})`,
      }
    }

    const { data: promo } = await supabase
      .from('promo_codes')
      .select('name, code')
      .eq('id', couponId)
      .maybeSingle()
    if (promo) {
      const couponCode = promo.code || promo.name || null
      return {
        couponCode,
        paymentLabel: couponCode ? `Promo code (${couponCode})` : 'Promo code',
      }
    }
  } catch (error) {
    console.error('Order coupon lookup failed:', error)
  }

  return { couponCode: null as string | null, paymentLabel: 'Standard checkout' }
}

function OrderMissing({ id }: { id: string }) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/orders">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to orders
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">Order not found</h1>
      <p className="text-muted-foreground">
        We could not load order <span className="font-mono">{id}</span>. It may
        have been deleted, or the related customer data is missing.
      </p>
    </div>
  )
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  let id = ''
  try {
    const resolved = await params
    id = String(resolved?.id || '')
  } catch (error) {
    console.error('Order detail params failed:', error)
    return <OrderMissing id="" />
  }

  if (!id) {
    return <OrderMissing id="" />
  }

  try {
    const raw = await getOrderById(id)
    const order = asRecord(raw)
    if (!order) {
      return <OrderMissing id={id} />
    }

    const { couponCode, paymentLabel } = await loadCouponLabel(order.coupon_id)
    const items = Array.isArray(order.order_items) ? order.order_items : []
    const user = firstRecord(order.users)
    const kiosk = firstRecord(order.kiosks)
    const status = String(order.status || 'unknown')

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
            <h1 className="text-3xl font-bold">
              {text(order.order_number) || id}
            </h1>
            <p className="text-muted-foreground">Order details</p>
          </div>
          <OrderStatusSelect
            orderId={id}
            status={status}
            className="w-[220px]"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Date and time</p>
                <p className="font-medium">
                  {formatDateTime(text(order.created_at))}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <OrderStatusSelect orderId={id} status={status} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="font-medium">
                  {formatMoney(
                    typeof order.total_amount === 'number'
                      ? order.total_amount
                      : Number(order.total_amount)
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Promo / coupon</p>
                <p className="font-medium">{couponCode || 'None'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment</p>
                <p className="font-medium">{paymentLabel}</p>
              </div>
              {text(order.pickup_code) ? (
                <div>
                  <p className="text-sm text-muted-foreground">Pickup code</p>
                  <p className="font-medium font-mono text-sm">
                    {text(order.pickup_code)}
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
                  {text(user?.full_name) ||
                    text(user?.email) ||
                    text(user?.phone) ||
                    '—'}
                </p>
                {text(user?.email) ? (
                  <p className="text-sm text-muted-foreground">{text(user?.email)}</p>
                ) : null}
                {text(user?.phone) ? (
                  <p className="text-sm text-muted-foreground">{text(user?.phone)}</p>
                ) : null}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kiosk</p>
                <p className="font-medium">{text(kiosk?.name) || '—'}</p>
                <p className="text-sm text-muted-foreground">
                  {text(kiosk?.address) || text(kiosk?.location) || ''}
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
                  items.map((rawItem, index) => {
                    const item = asRecord(rawItem) || {}
                    const product = firstRecord(item.products)
                    const addons = Array.isArray(item.addons)
                      ? item.addons.filter((value) => typeof value === 'string')
                      : []
                    return (
                      <TableRow key={text(item.id) || `item-${index}`}>
                        <TableCell className="font-medium">
                          {text(product?.name) || 'Unknown product'}
                        </TableCell>
                        <TableCell>
                          {typeof item.quantity === 'number'
                            ? item.quantity
                            : Number(item.quantity) || 0}
                        </TableCell>
                        <TableCell>
                          {formatMoney(
                            typeof item.price === 'number'
                              ? item.price
                              : Number(item.price)
                          )}
                        </TableCell>
                        <TableCell>
                          {addons.length > 0 ? addons.join(', ') : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  } catch (error) {
    console.error('Order detail failed to render:', error)
    return <OrderMissing id={id} />
  }
}
