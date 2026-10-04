import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function KioskNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Kiosk not found</h1>
      <Button asChild>
        <Link href="/dashboard/kiosks">Back to kiosks</Link>
      </Button>
    </div>
  )
}
