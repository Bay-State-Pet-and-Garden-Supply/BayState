import { Metadata } from 'next';
import { History } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { PublishHistoryClient } from '@/components/admin/pipeline/PublishHistoryClient';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Publish History | Admin | Bay State Pet & Garden',
  description: 'View products published to the storefront by day.',
  robots: {
    index: false,
    follow: false,
  },
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    brand?: string;
    startDate?: string;
    endDate?: string;
  }>;
}

export default async function PublishHistoryPage({ searchParams }: PageProps) {
  const { search, brand, startDate, endDate } = await searchParams;
  const supabase = await createClient();

  // Determine date bounds
  const now = new Date();
  const defaultEndDate = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  const defaultStartDate = sevenDaysAgo.toISOString().split('T')[0];

  const activeStartDate = startDate || defaultStartDate;
  const activeEndDate = endDate || defaultEndDate;

  // Build query
  // Convert YYYY-MM-DD local bounds to ISO bounds.
  // To get the full day, we can query from startDate 00:00:00 to endDate 23:59:59.
  const startISO = new Date(`${activeStartDate}T00:00:00`).toISOString();
  const endISO = new Date(`${activeEndDate}T23:59:59.999`).toISOString();

  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      upc,
      published_at,
      brand_id,
      brand:brands(id, name, slug)
    `)
    .not('published_at', 'is', null)
    .gte('published_at', startISO)
    .lte('published_at', endISO)
    .order('published_at', { ascending: false });

  if (brand && brand !== 'all') {
    query = query.eq('brand_id', brand);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,upc.ilike.%${search}%`);
  }

  const [productsRes, brandsRes] = await Promise.all([
    query,
    supabase.from('brands').select('id, name').order('name', { ascending: true }),
  ]);

  const rawProducts = productsRes.data || [];
  const brands = brandsRes.data || [];

  const products = rawProducts.map((p) => {
    const brandRecord = Array.isArray(p.brand) ? p.brand[0] ?? null : p.brand;
    return {
      id: p.id,
      name: p.name,
      upc: p.upc || '',
      published_at: p.published_at,
      brandName: brandRecord?.name || 'No Brand',
      brandId: p.brand_id,
    };
  });

  return (
    <AdminPageShell
      title="Publish History"
      description="Track products published to the storefront by day."
      icon={<History className="h-5 w-5" />}
      eyebrow="Operations"
    >
      <PublishHistoryClient
        initialProducts={products}
        brands={brands}
        initialStartDate={activeStartDate}
        initialEndDate={activeEndDate}
      />
    </AdminPageShell>
  );
}
