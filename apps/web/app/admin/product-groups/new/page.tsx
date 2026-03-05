import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createProductGroup } from '@/lib/admin/product-group-actions'

export default async function NewProductGroupPage() {
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/admin/login')
  }

  // Check if user is admin/staff
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    redirect('/admin')
  }

  // Fetch brands for dropdown
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name')
    .order('name')

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/admin/product-groups">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Product Groups
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create Product Group</CardTitle>
          <CardDescription>
            Group related products (like different sizes) under a single page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createProductGroup} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Blue Buffalo Life Protection Formula"
                required
              />
              <p className="text-sm text-muted-foreground">
                Display name for the group (shown on product page)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL Slug</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="e.g., blue-buffalo-life-protection-formula"
                required
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers, and hyphens only"
              />
              <p className="text-sm text-muted-foreground">
                URL-friendly identifier (used in /products/&#123;slug&#125;)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                placeholder="Optional description for this product group..."
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hero_image_url">Hero Image URL</Label>
              <Input
                id="hero_image_url"
                name="hero_image_url"
                placeholder="https://example.com/image.jpg"
                type="url"
              />
              <p className="text-sm text-muted-foreground">
                Optional hero image shown at the top of the product page
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand_id">Brand (Optional)</Label>
              <select
                id="brand_id"
                name="brand_id"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No brand selected</option>
                {brands?.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active" className="text-sm font-normal">
                Active (visible on storefront)
              </Label>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit">Create Group</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/admin/product-groups">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
