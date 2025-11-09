import { getUsers } from '@/app/actions/users'
import { DataTable } from '@/components/tables/data-table'
import { userColumns } from './columns'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ExportUsersButton } from './export-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreateUserForm } from './create-user-form'

export default async function UsersPage() {
  const users = await getUsers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts and profiles
          </p>
        </div>
        <div className="flex gap-2">
          <ExportUsersButton users={users} />
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new user account.
                </DialogDescription>
              </DialogHeader>
              <CreateUserForm />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable columns={userColumns} data={users} searchKey="email" />
    </div>
  )
}

