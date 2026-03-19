import { createPreorderGroup } from '@/lib/admin/preorder-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NewPreorderGroupPage() {
  const createWithId = createPreorderGroup

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Link
        href="/admin/preorder-groups"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Groups
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create Pre-Order Group</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWithId} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Baby Chicks, Ducklings"
                required
              />
              <p className="text-xs text-muted-foreground">
                Internal name for this pre-order program
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="e.g., baby-chicks"
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                placeholder="Optional description for internal reference..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minimum_quantity">Minimum Quantity *</Label>
              <Input
                id="minimum_quantity"
                name="minimum_quantity"
                type="number"
                min="1"
                defaultValue="6"
                required
              />
              <p className="text-xs text-muted-foreground">
                Minimum total quantity required per batch (e.g., 6 chicks)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_copy">Display Copy (optional)</Label>
              <textarea
                id="display_copy"
                name="display_copy"
                placeholder="e.g., Minimum 6 chicks per arrival date"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Shown to customers on product pages
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="pickup_only" name="pickup_only" defaultChecked />
              <Label htmlFor="pickup_only">Pickup only</Label>
              <p className="text-xs text-muted-foreground ml-2">
                Items in this group can only be picked up (no delivery)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="is_active" name="is_active" defaultChecked />
              <Label htmlFor="is_active">Active</Label>
              <p className="text-xs text-muted-foreground ml-2">
                Inactive groups won&apos;t show on the storefront
              </p>
            </div>

            <div className="flex gap-4">
              <Button type="submit">Create Group</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/preorder-groups">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
