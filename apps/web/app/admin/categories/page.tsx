import { AdminPageShell } from '@/components/admin/admin-page-shell';
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
    <AdminPageShell title="Categories">
      <AdminCategoriesClient
        initialCategories={(categories || []) as Category[]}
        totalCount={count || 0}
      />
    </AdminPageShell>
  );
}
