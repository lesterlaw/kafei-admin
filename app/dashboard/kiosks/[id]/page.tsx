import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getKioskById } from '@/app/actions/kiosks'
import { EditKioskForm } from '@/app/dashboard/kiosks/edit-kiosk-form'
import { KioskBlockButton } from '@/components/kiosk-block-button'
import { KioskDeviceToken } from '@/components/kiosk-device-token'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function KioskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let kiosk: Awaited<ReturnType<typeof getKioskById>> | null = null
  try {
    kiosk = await getKioskById(id)
  } catch {
    kiosk = null
  }

  if (!kiosk) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-2">
            <Link href="/dashboard/kiosks">Back to kiosks</Link>
          </Button>
          <h1 className="text-3xl font-bold">{kiosk.name}</h1>
          <p className="text-muted-foreground">{kiosk.location}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={kiosk.is_active ? 'default' : 'destructive'}>
            {kiosk.is_active ? 'Active' : 'Blocked'}
          </Badge>
          <KioskBlockButton
            kioskId={kiosk.id}
            isActive={kiosk.is_active}
            kioskName={kiosk.name}
            size="default"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kiosk details</CardTitle>
          </CardHeader>
          <CardContent>
            <EditKioskForm kiosk={kiosk} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kiosk APK pairing</CardTitle>
          </CardHeader>
          <CardContent>
            <KioskDeviceToken
              kioskId={kiosk.id}
              token={kiosk.device_token}
              lastSeenAt={kiosk.device_last_seen_at}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
