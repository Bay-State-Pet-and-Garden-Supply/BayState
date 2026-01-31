'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ConfigEditorClient } from './ConfigEditorClient';
import { defaultConfigValues } from '@/lib/admin/scraper-configs/form-schema';

interface ConfigEditorProps {
  configId?: string; // Optional - if undefined, we might be creating? But actions suggest create first.
}

export async function ConfigEditor({ configId }: ConfigEditorProps) {
  if (!configId) {
    // If no ID, we are likely creating a NEW one, but typically we create the record first via a wizard.
    // For now, let's assume valid configId.
    return <div>Config ID required</div>;
  }

  const supabase = await createAdminClient();

  // Fetch the config and its current version
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('*, scraper_config_versions(*)')
    .eq('id', configId)
    .single();

  if (configError || !config) {
    notFound();
  }

  // Find the current draft/version
  const currentVersionId = config.current_version_id;
  const currentVersion = config.scraper_config_versions.find((v: any) => v.id === currentVersionId);

  if (!currentVersion) {
    return <div>Configuration version not found.</div>;
  }

  return (
    <ConfigEditorClient
      configId={config.id}
      initialConfig={currentVersion.config || defaultConfigValues}
      initialStatus={currentVersion.status}
      initialVersion={currentVersion.version_number}
      initialValidationResult={currentVersion.validation_result}
    />
  );
}
