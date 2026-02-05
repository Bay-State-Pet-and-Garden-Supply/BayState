import { createAdminClient } from '@/lib/supabase/server';
import { ConfigsClient } from '@/components/admin/scrapers/ConfigsClient';

interface ScraperConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  created_at: string;
  updated_at: string;
  current_version_id: string | null;
  version_status?: string | null;
}

async function getConfigs(): Promise<{ configs: ScraperConfig[]; totalCount: number }> {
  const supabase = await createAdminClient();

  const { data: configs, error, count } = await supabase
    .from('scraper_configs')
    .select(`
      id,
      slug,
      display_name,
      domain,
      created_at,
      updated_at,
      current_version_id
    `, { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching configs:', error);
    return { configs: [], totalCount: 0 };
  }

  // Fetch version status for each config
  const configsWithStatus = await Promise.all(
    (configs || []).map(async (config) => {
      if (!config.current_version_id) {
        return { ...config, version_status: null };
      }

      const { data: version } = await supabase
        .from('scraper_config_versions')
        .select('status')
        .eq('id', config.current_version_id)
        .single();

      return {
        ...config,
        version_status: version?.status || null,
      };
    })
  );

  return { configs: configsWithStatus, totalCount: count || 0 };
}

export default async function ConfigsPage() {
  const { configs, totalCount } = await getConfigs();
  return <ConfigsClient initialConfigs={configs} totalCount={totalCount} />;
}
