'use client'

import { exportToCSV } from '@/lib/utils/csv'
import { Button } from '@/components/ui/button'
import { User } from '@/types/database'

export function ExportUsersButton({ users }: { users: User[] }) {
  const handleExport = () => {
    exportToCSV(users, 'users', [
      { key: 'email', header: 'Email' },
      { key: 'full_name', header: 'Full Name' },
      { key: 'phone', header: 'Phone' },
      { key: 'is_blocked', header: 'Status' },
      { key: 'created_at', header: 'Created At' },
    ])
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}

