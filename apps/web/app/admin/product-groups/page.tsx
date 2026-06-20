import { Boxes } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { ProductGroupingWorkspace } from '@/components/admin/product-groups/ProductGroupingWorkspace';

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ProductGroupsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialGroupId = params.id || null;

  const supabase = await createClient();

  // Fetch groups
  const { data: groupsData, error: groupsError } = await supabase
    .from('product_groups')
    .select('*')
    .order('name');

  if (groupsError) {
    console.error('Failed to fetch product groups:', groupsError);
  }

  // Fetch member counts
  const { data: memberCounts, error: countsError } = await supabase
    .from('product_group_products')
    .select('group_id');

  if (countsError) {
    console.error('Failed to fetch product group counts:', countsError);
  }

  const countsMap = new Map<string, number>();
  for (const member of memberCounts || []) {
    const current = countsMap.get(member.group_id) || 0;
    countsMap.set(member.group_id, current + 1);
  }

  const groups = (groupsData || []).map((g) => ({
    ...g,
    member_count: countsMap.get(g.id) || 0,
  }));

  // Fetch brands
  const { data: brands, error: brandsError } = await supabase
    .from('brands')
    .select('id, name')
    .order('name');

  if (brandsError) {
    console.error('Failed to fetch brands:', brandsError);
  }

  return (
    <AdminPageShell
      title="Product groups"
      description="Keep related products together under one storefront page and manage variants in one calm workspace."
      icon={<Boxes className="h-5 w-5" />}
      eyebrow="Workspace view"
      fullHeight
    >
      <ProductGroupingWorkspace
        initialGroups={groups}
        brands={brands || []}
        initialGroupId={initialGroupId}
      />
    </AdminPageShell>
  );
}
