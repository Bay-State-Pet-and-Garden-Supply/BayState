import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigEditorClient } from '@/components/admin/scrapers/configs/ConfigEditorClient';
import { migrateLegacyConfig } from '@/lib/admin/scraper-configs/form-schema';

interface EditScraperConfigPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditScraperConfigPage({ params }: EditScraperConfigPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch config first
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('*')
    .eq('id', id)
    .single();

  if (configError || !config) {
    notFound();
  }

  // Fetch version separately to avoid RLS issues with embedded joins
  const { data: version, error: versionError } = await supabase
    .from('scraper_config_versions')
    .select('*')
    .eq('id', config.current_version_id)
    .single();

  if (versionError || !version) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">No Config Version Found</h1>
        <p className="text-muted-foreground">
          This scraper config has no current version. Please contact an administrator.
        </p>
      </div>
    );
  }

  const initialData = migrateLegacyConfig(version.config as Record<string, unknown>);

  // Ensure required arrays have defaults to match schema expectations
  if (!initialData.workflows) initialData.workflows = [];
  if (!initialData.test_skus) initialData.test_skus = [];
  if (!initialData.fake_skus) initialData.fake_skus = [];

  return (
    <ConfigEditorClient
      configId={id}
      initialData={initialData}
      mode="edit"
    />
  );
}
