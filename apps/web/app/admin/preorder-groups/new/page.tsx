import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createPreorderGroup } from '@/lib/admin/preorder-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewPreorderGroupPage() {
  return (
    <AdminPageShell
      title="New pre-order group"
      description="Create a pre-order program for pickup items, seasonal arrivals, or other minimum-order workflows."
      icon={<CalendarPlus className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/preorder-groups"
      backLabel="Back to pre-order groups"
    >
      <div className="mx-auto w-full max-w-3xl pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Create pre-order group</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPreorderGroup} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group name</Label>
                <Input id="name" name="name" placeholder="e.g. Baby chicks or ducklings" required />
                <p className="text-sm text-muted-foreground">Internal name for this pre-order program.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="e.g. baby-chicks"
                  required
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                />
                <p className="text-sm text-muted-foreground">Used in URLs and internal links.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Optional internal description"
                  className="min-h-[96px] w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minimum_quantity">Minimum quantity</Label>
                  <Input id="minimum_quantity" name="minimum_quantity" type="number" min="1" defaultValue="6" required />
                  <p className="text-sm text-muted-foreground">Minimum quantity required per arrival batch.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_copy">Display copy</Label>
                  <textarea
                    id="display_copy"
                    name="display_copy"
                    placeholder="Shown to customers on the product page"
                    className="min-h-[96px] w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                  <Checkbox id="pickup_only" name="pickup_only" defaultChecked className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium text-foreground">Pickup only</span>
                    <span className="block text-sm text-muted-foreground">Use this when customers must pick up the order in store.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                  <Checkbox id="is_active" name="is_active" defaultChecked className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium text-foreground">Active</span>
                    <span className="block text-sm text-muted-foreground">Active groups stay available for storefront selection.</span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit">Create group</Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/admin/preorder-groups">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  );
}
