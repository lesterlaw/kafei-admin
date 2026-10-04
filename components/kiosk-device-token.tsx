'use client'

import { useState } from 'react'
import { regenerateKioskDeviceToken } from '@/app/actions/kiosks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KIOSK_APK_PAGE_PATH, KIOSK_APK_VERSION, formatKioskToken } from '@/lib/kiosk/apk'

interface KioskDeviceTokenProps {
  kioskId: string
  token?: string | null
  lastSeenAt?: string | null
}

export function KioskDeviceToken({
  kioskId,
  token,
  lastSeenAt,
}: KioskDeviceTokenProps) {
  const [currentToken, setCurrentToken] = useState(token || '')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleRegenerate = async () => {
    setIsLoading(true)
    setError(null)
    const result = await regenerateKioskDeviceToken(kioskId)
    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }
    setCurrentToken(result.token || '')
    setIsLoading(false)
  }

  const handleCopy = async () => {
    if (!currentToken) return
    await navigator.clipboard.writeText(currentToken)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="device_token">Kiosk APK token</Label>
        <Input
          id="device_token"
          value={formatKioskToken(currentToken)}
          readOnly
          className="font-mono text-xl font-bold tracking-[0.18em]"
          placeholder="Generate a 10-digit token, then type it on the tablet"
        />
        <p className="text-xs text-muted-foreground">
          Type this 10-digit code on the tablet. The APK never talks to
          CofePlus. On pairing, choose window 1 or window 2 so that tablet
          only starts drinks for that hole. Regenerating kicks the current
          tablet off.
          {lastSeenAt ? ` Last seen ${new Date(lastSeenAt).toLocaleString('en-SG')}.` : ''}
          {' '}Download {KIOSK_APK_VERSION} from{' '}
          <a href={KIOSK_APK_PAGE_PATH} className="underline" target="_blank" rel="noreferrer">
            {KIOSK_APK_PAGE_PATH}
          </a>
          .
        </p>
      </div>
      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleCopy}
          disabled={!currentToken}
        >
          {copied ? 'Copied' : 'Copy token'}
        </Button>
        <Button type="button" onClick={handleRegenerate} disabled={isLoading}>
          {isLoading
            ? 'Saving...'
            : currentToken
              ? 'Regenerate token'
              : 'Generate token'}
        </Button>
      </div>
    </div>
  )
}
