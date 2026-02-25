import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { ScrapersClient } from '@/components/admin/scrapers/ScrapersClient';
import { ScraperRecord } from '@/lib/admin/scrapers/types';

export const metadata: Metadata = {
  title: 'Scraper Configs | Admin',
  description: 'Manage product scraper configurations',
};

// Based on the types in types.ts and schema.ts, we need to adapt the DB row
type ScraperConfigRow = {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  scraper_type: string;
  status: string;
  health_status: string;
  health_score: number;
  last_test_at: string | null;
  scraper_config_versions: { status: string; config?: any } | { status: string; config?: any }[] | null;
  config?: any;
};

function normalizeCurrentVersion(version: any): { status?: string; config?: any } | null {
  if (Array.isArray(version)) {
    return version[0] ?? null;
  }
  return version ?? null;
}

export default async function ScrapersPage() {
  const supabase = await createClient();

  // Try the old table structure first since the types match that
  const { data: configs, count } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      scraper_type,
      health_status,
      health_score,
      last_test_at,
      scraper_config_versions!fk_current_version (
        status,
        config
      )
    `, { count: 'exact' })
    .order('slug', { ascending: true });

  const formattedScrapers: ScraperRecord[] = (configs || []).map((config: any) => {
    const version = normalizeCurrentVersion(config.scraper_config_versions);
    
    return {
      id: config.id,
      name: config.slug,
      display_name: config.display_name,
      base_url: config.domain || '',
      scraper_type: config.scraper_type || 'static',
      status: (version?.status as any) || 'draft',
      health_status: (config.health_status as any) || 'unknown',
      health_score: config.health_score || 0,
      last_test_at: config.last_test_at,
      config: version?.config || {},
      created_at: new Date().toISOString(), // Mocked since we didn't fetch it
      updated_at: new Date().toISOString(),
      created_by: null,
      last_test_result: null,
    };
  });

  return (
    <ScrapersClient 
      initialScrapers={formattedScrapers} 
      totalCount={count || 0} 
    />
  );
}
