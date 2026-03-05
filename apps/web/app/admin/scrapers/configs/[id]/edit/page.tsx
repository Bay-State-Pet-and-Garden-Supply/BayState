import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function RedirectScraperConfigEdit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  // Try to find the slug for this config ID
  const supabase = await createClient();
  const { data } = await supabase
    .from('scraper_configs')
    .select('slug')
    .eq('id', id)
    .single();

  if (data?.slug) {
    redirect(`/admin/scrapers/${data.slug}/configuration`);
  }
  
  // Fallback if not found
  redirect('/admin/scrapers/list');
}
