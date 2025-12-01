'use client'

import { useState } from 'react'
import { createSubpage } from '@/app/actions/subpages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function CreateSubpageForm() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)

    const result = await createSubpage(formData)

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
        <Label htmlFor="title">Page Title</Label>
        <Input id="title" name="title" required disabled={isLoading} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug (URL-friendly)</Label>
        <Input id="slug" name="slug" required disabled={isLoading} />
        <p className="text-xs text-muted-foreground">
          Example: privacy-policy, terms-conditions
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" name="content" rows={10} required disabled={isLoading} />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Subpage'}
      </Button>
    </form>
  )
}




