import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function TestLabRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('scraper_configs')
    .select('slug')
    .eq('id', id)
    .single();

  if (data?.slug) {
    redirect(`/admin/scrapers/${data.slug}/test-lab`);
  }

  redirect('/admin/scrapers/list');
}
