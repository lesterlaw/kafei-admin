import { Download, MonitorSmartphone, ShieldCheck, Smartphone } from 'lucide-react'
import { KioskCopyField } from '@/components/kiosk-copy-field'
import { Button } from '@/components/ui/button'
import {
  KIOSK_APK_PAGE_PATH,
  KIOSK_APK_SIZE_LABEL,
  KIOSK_APK_VERSION,
  KIOSK_SERVER_URL,
  getKioskApkStorageUrl,
} from '@/lib/kiosk/apk'

export const metadata = {
  title: 'KAFEI Kiosk download',
  description: 'Download the KAFEI Kiosk Android APK and pair it with Kafei admin.',
}

export default function KioskDownloadPage() {
  const apkUrl = getKioskApkStorageUrl()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <MonitorSmartphone className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-accent">KAFEI</p>
            <h1 className="text-2xl font-bold">Kiosk app</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Install this APK on both machine tablets. Type the kiosk&apos;s
          10-digit token on the tablet, then choose window 1 or window 2 so
          each tablet only starts drinks for that hole. Staff get the token
          from Kafei admin: Kiosks, open the kiosk, Kiosk APK token.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Version</p>
            <p className="font-medium">{KIOSK_APK_VERSION}</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="font-medium">{KIOSK_APK_SIZE_LABEL}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <KioskCopyField
            id="kiosk-server-url"
            label="Server URL"
            value={KIOSK_SERVER_URL}
          />
        </div>

        <Button asChild className="mt-6 h-12 w-full text-base">
          <a href={apkUrl} download="kafei-kiosk.apk">
            <Download className="size-5" />
            Download APK
          </a>
        </Button>

        <p className="mt-3 break-all text-center text-xs text-muted-foreground">
          {KIOSK_APK_PAGE_PATH}
        </p>

        <ol className="mt-8 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-accent" />
            Open this page on the tablet and tap Download APK.
          </li>
          <li className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            Allow install from this browser if Android asks.
          </li>
          <li className="flex gap-3">
            <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-accent" />
            Open KAFEI Kiosk, type the 10-digit token, choose window 1 or
            window 2, then pair.
          </li>
        </ol>
      </div>
    </main>
  )
}
