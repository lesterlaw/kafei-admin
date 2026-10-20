import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { deleteAddOn, getAddOnById } from '@/app/actions/products'
import { getProducts } from '@/app/actions/data'
import { AddOnForm } from '../addon-form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function AddOnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [addon, products] = await Promise.all([
    getAddOnById(id).catch(() => null),
    getProducts(),
  ])

  if (!addon) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{addon.name}</h1>
          <p className="text-muted-foreground">
            Edit display name, extra price, visibility, and which drinks show
            this add-on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {addon.source ? (
            <Badge variant="secondary">{addon.source}</Badge>
          ) : null}
          <Link href="/dashboard/products/add-ons">
            <Button variant="outline">Back</Button>
          </Link>
        </div>
      </div>

      {addon.cofeplus_display_changed_at && addon.cofeplus_display ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          The machine now calls <code>{addon.cofeplus_group}/{addon.cofeplus_flag}</code>{' '}
          <strong>{addon.cofeplus_display}</strong>. Customers who pick{' '}
          <strong>{addon.name}</strong> get that option. Fix the display name if
          it no longer fits, then save to clear this notice.
        </div>
      ) : null}

      <AddOnForm products={products} addon={addon} />

      <form
        action={async () => {
          'use server'
          await deleteAddOn(id)
          redirect('/dashboard/products/add-ons')
        }}
      >
        <Button type="submit" variant="destructive">
          Delete add-on
        </Button>
      </form>
    </div>
  )
}
