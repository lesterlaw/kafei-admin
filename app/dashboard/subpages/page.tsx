import { getSubpages } from '@/app/actions/subpages'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CreateSubpageForm } from './create-subpage-form'
import { EditSubpageForm } from './edit-subpage-form'

export default async function SubpagesPage() {
  const subpages = await getSubpages()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subpages Management</h1>
          <p className="text-muted-foreground">
            Manage static pages (Max 5 pages)
          </p>
        </div>
        {subpages.length < 5 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Subpage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Subpage</DialogTitle>
                <DialogDescription>
                  Add a new static page.
                </DialogDescription>
              </DialogHeader>
              <CreateSubpageForm />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {subpages.map((page) => (
          <Card key={page.id}>
            <CardHeader>
              <CardTitle>{page.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Slug: /{page.slug}
              </p>
              <p className="text-sm line-clamp-3">{page.content}</p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Edit Subpage</DialogTitle>
                    <DialogDescription>
                      Update subpage content.
                    </DialogDescription>
                  </DialogHeader>
                  <EditSubpageForm subpage={page} />
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

