'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Stage = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('checking')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // The email link brings either ?code=... (PKCE) or a session in the URL hash.
  useEffect(() => {
    const supabase = createClient()
    const code = new URLSearchParams(window.location.search).get('code')

    const start = async () => {
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setStage('invalid')
          return
        }
      }
      const { data } = await supabase.auth.getSession()
      setStage(data.session ? 'ready' : 'invalid')
    }

    start()
  }, [])

  const handleSubmit = async (formData: FormData) => {
    const password = String(formData.get('password') || '')
    const confirm = String(formData.get('confirm') || '')
    setError(null)

    if (password.length < 12) {
      setError('Use at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setIsLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setIsLoading(false)
      return
    }

    await supabase.auth.signOut()
    setStage('done')
    setIsLoading(false)
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md space-y-8 rounded-lg border bg-white p-8 shadow-lg dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Set a new password</h1>
          {stage === 'checking' && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Checking your reset link...</p>
          )}
          {stage === 'invalid' && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This reset link has expired or was already used. Request a new one.
            </p>
          )}
          {stage === 'done' && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Your password has been changed. Taking you to the login page.
            </p>
          )}
        </div>

        {stage === 'ready' && (
          <form action={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required disabled={isLoading} />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save new password'}
            </Button>
          </form>
        )}

        {(stage === 'invalid' || stage === 'done') && (
          <Link href={stage === 'invalid' ? '/forgot-password' : '/login'}>
            <Button className="w-full">{stage === 'invalid' ? 'Request a new link' : 'Back to Login'}</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
