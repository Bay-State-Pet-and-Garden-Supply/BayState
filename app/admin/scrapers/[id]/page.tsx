import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditScraperClient } from '@/components/admin/scrapers/editor/EditScraperClient';
import { ScraperConfig, SelectorConfig, WorkflowStep } from '@/lib/admin/scrapers/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: scraper } = await supabase
    .from('scrapers')
    .select('name, display_name')
    .eq('id', id)
    .single();

  return {
    title: scraper ? `${scraper.display_name || scraper.name} | Edit Scraper` : 'Edit Scraper',
  };
}

import { validate as uuidValidate } from 'uuid';

export default async function ScraperDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  console.log(`[ScraperDetailPage] Fetching scraper with ID: "${id}"`);

  if (!uuidValidate(id)) {
    console.error(`[ScraperDetailPage] Invalid UUID provided: "${id}"`);
    notFound();
  }

  const { data: scraper, error } = await supabase
    .from('scrapers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[ScraperDetailPage] Supabase error:', JSON.stringify(error, null, 2));
  }

  if (!scraper) {
    console.error(`[ScraperDetailPage] No scraper found for ID: ${id}`);
    notFound();
  }

  // Merge top-level fields into the config to ensure editor state is complete
  const dbConfig = scraper.config as unknown as Record<string, unknown> || {};

  const config = {
    ...dbConfig,
    name: scraper.name,
    display_name: scraper.display_name,
    base_url: scraper.base_url,
    // Map flattened fields if they exist and aren't in the config object
    selectors: (scraper.selectors as unknown as SelectorConfig[]) || (dbConfig.selectors as SelectorConfig[]) || [],
    workflows: (scraper.workflows as unknown as WorkflowStep[]) || (dbConfig.workflows as WorkflowStep[]) || [],
    test_skus: (scraper.test_skus as string[]) || (dbConfig.test_skus as string[]) || [],
    fake_skus: (scraper.fake_skus as string[]) || (dbConfig.fake_skus as string[]) || [],
    edge_case_skus: (scraper.edge_case_skus as string[]) || (dbConfig.edge_case_skus as string[]) || [],
    timeout: (scraper.timeout as number) || (dbConfig.timeout as number) || 30,
    retries: (scraper.retries as number) || (dbConfig.retries as number) || 3,
    image_quality: (scraper.image_quality as number) || (dbConfig.image_quality as number) || 50,
    login: (scraper.login as unknown as Record<string, unknown>) || (dbConfig.login as Record<string, unknown>),
    validation: (scraper.validation as unknown as Record<string, unknown>) || (dbConfig.validation as Record<string, unknown>),
  } as ScraperConfig;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex-1">
        <EditScraperClient initialConfig={config} />
      </div>
    </div>
  );
}
