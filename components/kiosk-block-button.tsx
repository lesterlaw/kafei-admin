'use client'

import { Ban, CheckCircle } from 'lucide-react'
import { updateKioskStatus } from '@/app/actions/kiosks'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface KioskBlockButtonProps {
  kioskId: string
  isActive: boolean
  kioskName?: string
  size?: 'sm' | 'default'
}

export function KioskBlockButton({
  kioskId,
  isActive,
  kioskName,
  size = 'sm',
}: KioskBlockButtonProps) {
  const handleToggle = async () => {
    await updateKioskStatus(kioskId, !isActive)
    window.location.reload()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={isActive ? 'destructive' : 'default'} size={size}>
          {isActive ? (
            <Ban className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {size === 'default' ? (
            <span className="ml-2">{isActive ? 'Block kiosk' : 'Unblock kiosk'}</span>
          ) : null}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? 'Block this kiosk?' : 'Unblock this kiosk?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? `Customers will not see ${kioskName || 'this kiosk'} in the app, and the tablet APK will stop scanning until you unblock it.`
              : `This will show ${kioskName || 'this kiosk'} in the app again and allow the tablet APK to scan.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleToggle()}>
            {isActive ? 'Block' : 'Unblock'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
