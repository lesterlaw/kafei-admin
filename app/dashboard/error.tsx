'use client'

import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">This page could not load</h1>
        <p className="text-muted-foreground">
          The admin panel is still available. Retry this page or open another
          section from the sidebar.
        </p>
      </div>
      {error?.digest ? (
        <p className="text-sm text-muted-foreground">Error id: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
