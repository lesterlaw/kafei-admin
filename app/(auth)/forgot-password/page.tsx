'use client'

import { useState } from 'react'
import { resetPassword } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const result = await resetPassword(formData)

    if (result?.error) {
      setError(result.error)
    } else if (result?.success) {
      setSuccess(true)
    }

    setIsLoading(false)
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="w-full max-w-md space-y-8 rounded-lg border bg-white p-8 shadow-lg dark:bg-zinc-900">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Check your email</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              We've sent a password reset link to your email address.
            </p>
          </div>
          <Link href="/login">
            <Button className="w-full">Back to Login</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md space-y-8 rounded-lg border bg-white p-8 shadow-lg dark:bg-zinc-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Forgot Password</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your email address and we'll send you a link to reset your
            password.
          </p>
        </div>

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
              placeholder="admin@example.com"
              required
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-between">
            <Link
              href="/login"
              className="text-sm text-primary hover:underline"
            >
              Back to Login
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </form>
      </div>
    </div>
  )
}




