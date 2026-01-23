import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigEditorClient } from '@/components/admin/scraper-configs/ConfigEditorClient';
import { migrateLegacyConfig } from '@/lib/admin/scraper-configs/form-schema';
import { validate as uuidValidate } from 'uuid';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: scraper } = await supabase
    .from('scraper_configs')
    .select('slug, display_name')
    .eq('id', id)
    .single();

  return {
    title: scraper ? `${scraper.display_name || scraper.slug} | Edit Config` : 'Edit Config',
  };
}

export default async function ScraperConfigPage({ params }: PageProps) {
  const { id } = await params;

  if (!uuidValidate(id)) {
    notFound();
  }

  // Fetch initial data
  const supabase = await createClient();
  
  // Fetch config first
  const { data: configRow, error: configError } = await supabase
    .from('scraper_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (configError || !configRow) {
    notFound();
  }

  // Fetch version separately to avoid RLS issues with embedded joins
  const { data: version, error: versionError } = await supabase
    .from('scraper_config_versions')
    .select('*')
    .eq('id', configRow.current_version_id)
    .single();

  if (versionError || !version) {
    notFound();
  }

  // Construct the config object in the format the client expects
  const config = {
    ...version,
    scraper_configs: configRow
  };

  // Apply migration to convert legacy selectors to inline extract_and_transform
  const migratedConfig = migrateLegacyConfig((config.config as Record<string, unknown>) || {});

  // Ensure required arrays have defaults to match schema expectations
  if (!migratedConfig.workflows) migratedConfig.workflows = [];
  if (!migratedConfig.test_skus) migratedConfig.test_skus = [];
  if (!migratedConfig.fake_skus) migratedConfig.fake_skus = [];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1">
        <ConfigEditorClient 
          configId={id} 
          mode="edit"
          initialData={migratedConfig as Record<string, unknown>} 
        />
      </div>
    </div>
  );
}
