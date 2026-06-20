import { notFound } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { ProductGroupingWorkspace } from '@/components/admin/product-groups/ProductGroupingWorkspace';

interface ProductGroupDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductGroupDetailPage({ params }: ProductGroupDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Verify group exists
  const { data: group, error: groupErr } = await supabase
    .from('product_groups')
    .select('id')
    .eq('id', id)
    .single();

  if (groupErr || !group) {
    notFound();
  }

  // Fetch groups
  const { data: groupsData } = await supabase
    .from('product_groups')
    .select('*')
    .order('name');

  // Fetch member counts
  const { data: memberCounts } = await supabase
    .from('product_group_products')
    .select('group_id');

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
  const { data: brands } = await supabase
    .from('brands')
    .select('id, name')
    .order('name');

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
        initialGroupId={id}
      />
    </AdminPageShell>
  );
}
