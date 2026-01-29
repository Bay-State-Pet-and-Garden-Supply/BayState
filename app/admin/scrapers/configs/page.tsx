import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ConfigsClient } from '@/components/admin/scrapers/ConfigsClient';

export const metadata: Metadata = {
  title: 'Scraper Configs | Admin',
  description: 'Manage scraper configurations',
};

export const dynamic = 'force-dynamic';

export default async function ConfigsPage() {
  const supabase = await createClient();

  const { data: configs, count, error } = await supabase
    .from('scraper_configs')
    .select('*, versions:scraper_config_versions(count)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching configs:', error);
  }

  return (
    <ConfigsClient
      initialConfigs={configs || []}
      totalCount={count || 0}
    />
  );
}
