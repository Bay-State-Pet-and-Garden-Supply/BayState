import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { Tag } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AdminBrandsClient } from '@/components/admin/brands/AdminBrandsClient';
import { type Brand } from '@/components/admin/brands/types';

export default async function AdminBrandsPage() {
  const supabase = await createClient();
  const { data: brands, count } = await supabase
    .from('brands')
    .select('*', { count: 'exact' })
    .order('name');

  return (
    <AdminPageShell 
      title="Brands"
      description="Manage product brands and their official domains."
      icon={<Tag className="h-5 w-5" />}
      eyebrow="Queue view"
    >
      <AdminBrandsClient
        initialBrands={(brands || []) as Brand[]}
        totalCount={count || 0}
      />
    </AdminPageShell>
  );
}
