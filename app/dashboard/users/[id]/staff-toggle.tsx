'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateUserStaff } from '@/app/actions/users'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function StaffToggle({
  userId,
  isStaff,
}: {
  userId: string
  isStaff: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateUserStaff(userId, !isStaff)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={isStaff ? 'secondary' : 'outline'}>
          {isStaff ? 'Staff: free drinks' : 'Customer'}
        </Badge>
        <Button
          variant={isStaff ? 'outline' : 'default'}
          size="sm"
          disabled={pending}
          onClick={toggle}
        >
          {pending ? 'Saving...' : isStaff ? 'Remove staff' : 'Make staff'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Staff pick &quot;Staff free drink&quot; under Promo Code at checkout. The whole
        cup, add-ons included, is $0 and no card is charged.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
