import { createAdminClient } from '../lib/supabase/server';
import { scrapeProducts } from '../lib/pipeline-scraping';

async function main() {
  console.log('Initializing Supabase client...');
  const supabase = await createAdminClient();

  console.log('Fetching Needs Attention products...');
  const { data: products, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('upc')
    .eq('pipeline_status', 'needs_attention');

  if (fetchError) {
    console.error('Failed to fetch products:', fetchError.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No products found in "needs_attention" status.');
    process.exit(0);
  }

  const upcs = products.map((p) => p.upc);
  console.log(`Found ${upcs.length} products to re-extract:`, upcs);

  console.log('Starting extraction run (Source Cascade with SERP fallbacks enabled)...');
  const result = await scrapeProducts(upcs, {
    retryMode: 'all',
    serpDiscoveryEnabled: true,
  });

  if (!result.success) {
    console.error('Failed to start scraping job:', result.error);
    process.exit(1);
  }

  console.log('Scraping job started successfully!');
  console.log('Job IDs:', result.jobIds);
  console.log('Skipped UPCs (if any):', result.skippedUpcs);
}

main().catch((err) => {
  console.error('Unexpected error in script:', err);
  process.exit(1);
});
