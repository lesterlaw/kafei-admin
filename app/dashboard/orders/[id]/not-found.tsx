import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OrderNotFound() {
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
        This order is missing or could not be loaded. Open another order from the
        list.
      </p>
    </div>
  )
}
