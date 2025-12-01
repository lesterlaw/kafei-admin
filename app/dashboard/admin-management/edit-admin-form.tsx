'use client'

import { useState } from 'react'
import { updateAdmin } from '@/app/actions/admins'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Admin } from '@/types/database'

export function EditAdminForm({ admin }: { admin: Admin }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    const result = await updateAdmin(admin.id, formData)

    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      window.location.reload()
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={admin.email}
          required
          disabled={isLoading}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="full_name">Full Name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={admin.full_name}
          required
          disabled={isLoading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Updating...' : 'Update Admin'}
      </Button>
    </form>
  )
}




