import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigEditorClient } from '@/components/admin/scraper-configs/ConfigEditorClient';

interface EditScraperConfigPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditScraperConfigPage({ params }: EditScraperConfigPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: config, error } = await supabase
    .from('scraper_configs')
    .select(`
      *,
      current_version:scraper_config_versions!current_version_id(*)
    `)
    .eq('id', id)
    .single();

  if (error || !config) {
    notFound();
  }

  const currentVersion = config.current_version as Record<string, unknown> | null;
  const initialData = currentVersion?.config as Record<string, unknown> | undefined;

  if (!initialData) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">No Config Version Found</h1>
        <p className="text-muted-foreground">
          This scraper config has no current version. Please contact an administrator.
        </p>
      </div>
    );
  }

  return (
    <ConfigEditorClient
      configId={id}
      initialData={initialData}
      mode="edit"
    />
  );
}
