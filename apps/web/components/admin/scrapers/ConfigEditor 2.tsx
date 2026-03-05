
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { ConfigEditorClient } from './ConfigEditorClient';

interface ConfigEditorProps {
  scraperId: string;
}

export async function ConfigEditor({ scraperId }: ConfigEditorProps) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Fetch scraper and current version details
  const { data: scraper, error } = await supabase
    .from('scraper_configs')
    .select(`
      *,
      current_version:current_version_id (
        id,
        status,
        version_number,
        schema_version,
        config,
        validation_result,
        created_at,
        updated_at
      )
    `)
    .eq('id', scraperId)
    .single();

  if (error || !scraper) {
    console.error('Error fetching scraper:', error);
    notFound();
  }

  // Ensure config is loaded from the version if available, otherwise fallback to base record
  // But wait, the schema says 'config' is on scraper_configs too? 
  // Ah, Task 5 migration moved it to versions but kept it on parent for compat?
  // Let's use the version config if available as it's the source of truth for drafts
  
  const effectiveScraper = {
    ...scraper,
    config: scraper.current_version?.config || scraper.config,
    // Add missing fields required by ScraperRecord type if needed
  };

  return (
    <ConfigEditorClient 
      scraper={effectiveScraper as any} 
      currentVersion={scraper.current_version} 
    />
  );
}
