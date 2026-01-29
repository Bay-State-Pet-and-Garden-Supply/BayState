import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { TestLabClient } from '@/components/admin/scrapers/TestLabClient';

export const metadata: Metadata = {
  title: 'Test Lab | Scraper Admin',
  description: 'Test and validate scraper configurations',
};

export const dynamic = 'force-dynamic';

export default async function TestLabPage() {
  const supabase = await createClient();

  const { data: scrapers } = await supabase
    .from('scrapers')
    .select('id, name, display_name, base_url, config')
    .order('name');

  const { data: recentTests } = await supabase
    .from('scraper_test_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <TestLabClient
      scrapers={scrapers || []}
      recentTests={recentTests || []}
    />
  );
}
