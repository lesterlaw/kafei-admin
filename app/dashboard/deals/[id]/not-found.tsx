import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function DealNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Deal not found</h1>
      <Button asChild>
        <Link href="/dashboard/deals">Back to deals</Link>
      </Button>
    </div>
  )
}
