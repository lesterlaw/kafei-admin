import { getAdmins } from '@/app/actions/admins'
import { DataTable } from '@/components/tables/data-table'
import { adminColumns } from './columns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { CreateAdminForm } from './create-admin-form'

export default async function AdminManagementPage() {
  try {
    const admins = await getAdmins()

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Management</h1>
            <p className="text-muted-foreground">
              Manage administrator accounts (Max 3 admins)
            </p>
          </div>
          {admins.length < 3 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Admin</DialogTitle>
                  <DialogDescription>
                    Create a new administrator account. Maximum of 3 admins allowed.
                  </DialogDescription>
                </DialogHeader>
                <CreateAdminForm />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <DataTable columns={adminColumns} data={admins} />
      </div>
    )
  } catch (error: any) {
    console.error('Error loading admins:', error)
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Management</h1>
          <p className="text-muted-foreground">
            Manage administrator accounts (Max 3 admins)
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          <p className="font-semibold">Error loading admins</p>
          <p className="text-sm">{error.message}</p>
        </div>
      </div>
    )
  }
}

