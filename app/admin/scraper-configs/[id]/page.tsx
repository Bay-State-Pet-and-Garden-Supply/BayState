import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ConfigEditorClient } from '@/components/admin/scraper-configs/ConfigEditorClient';
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
  const { data: config } = await supabase
    .from('scraper_config_versions')
    .select('*, scraper_configs(*)')
    .eq('config_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (!config) {
    notFound();
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ConfigEditorClient 
          configId={id} 
          mode="edit"
          initialData={config.config as Record<string, unknown>} 
        />
      </div>
    </div>
  );
}
