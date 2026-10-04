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
