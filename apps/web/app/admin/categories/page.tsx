import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { FolderTree } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { AdminCategoriesClient } from '@/components/admin/categories/AdminCategoriesClient';
import { type Category } from '@/components/admin/categories/CategoryModal';

export default async function AdminCategoriesPage() {
  const supabase = await createClient();
  const { data: categories, count } = await supabase
    .from('categories')
    .select('*', { count: 'exact' })
    .order('display_order')
    .order('name');

  return (
    <AdminPageShell 
      title="Categories"
      description="Organize your products into a hierarchical category structure."
      icon={<FolderTree className="h-5 w-5" />}
      compactHeader
    >
      <AdminCategoriesClient
        initialCategories={(categories || []) as Category[]}
        totalCount={count || 0}
      />
    </AdminPageShell>
  );
}
