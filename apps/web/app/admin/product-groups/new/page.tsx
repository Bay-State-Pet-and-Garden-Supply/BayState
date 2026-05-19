import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createProductGroup } from '@/lib/admin/product-group-actions';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default async function NewProductGroupPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    redirect('/admin');
  }

  const { data: brands } = await supabase.from('brands').select('id, name').order('name');

  return (
    <AdminPageShell
      title="New product group"
      description="Group related products under one storefront page so staff can manage copy, hero imagery, and the default product in one place."
      icon={<Boxes className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/product-groups"
      backLabel="Back to product groups"
    >
      <div className="mx-auto w-full max-w-3xl pb-6">
        <Card>
          <CardHeader>
            <CardTitle>Create product group</CardTitle>
            <CardDescription>
              Use groups for related products such as different sizes or flavor variants.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProductGroup} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group name</Label>
                <Input id="name" name="name" placeholder="e.g. Blue Buffalo Life Protection Formula" required />
                <p className="text-sm text-muted-foreground">Display name shown on the grouped product page.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="e.g. blue-buffalo-life-protection-formula"
                  required
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                />
                <p className="text-sm text-muted-foreground">Used in storefront URLs.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Optional shared description for this grouped product page"
                  className="min-h-[110px] w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero_image_url">Hero image URL</Label>
                <Input id="hero_image_url" name="hero_image_url" placeholder="https://example.com/image.jpg" type="url" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand_id">Brand</Label>
                <select id="brand_id" name="brand_id" className="w-full rounded-[0.8rem] border border-input bg-background px-3 py-2 text-sm">
                  <option value="">No brand selected</option>
                  {brands?.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                <input type="checkbox" id="is_active" name="is_active" defaultChecked className="mt-1 h-4 w-4" />
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">Active on the storefront</span>
                  <span className="block text-sm text-muted-foreground">Inactive groups stay hidden from customers until the page is ready.</span>
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit">Create group</Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/admin/product-groups">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminPageShell>
  );
}
