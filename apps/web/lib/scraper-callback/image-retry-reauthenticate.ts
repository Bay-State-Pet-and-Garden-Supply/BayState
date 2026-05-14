import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import type {
  BrowserSessionState,
  ProductRetryContext,
} from './image-retry-processor';

function getSupabaseAdmin(): Pick<SupabaseClient, 'from'> {
  const url = SUPABASE_URL;
  const key = SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration for reauthenticate');
  }
  return createClient(url, key);
}

/**
 * Production reauthenticate that creates a scrape job instead of
 * exec'ing Python locally.
 *
 * When a login-protected image retry fails authentication, this queues a
 * standard scrape job for the SKU. The scraper daemon will pick up the job,
 * authenticate, capture images, and the callback will update product sources
 * with durable URLs.
 *
 * The returned session state has a null expiry, signalling that the
 * retry processor should rely on the scrape job rather than a local
 * browser state file.
 */
export async function createScrapeJobReauthenticate(
  context: ProductRetryContext,
  session: BrowserSessionState,
): Promise<BrowserSessionState> {
  if (!context.scraper?.slug) {
    throw new Error('Cannot re-authenticate without a scraper slug');
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const scraperSlug = context.scraper.slug;
  const sku = context.sku;

  // Create the parent scrape job
  const { data: jobRow, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({
      skus: [sku],
      scrapers: [scraperSlug],
      status: 'pending',
      type: 'standard',
      test_mode: false,
      max_workers: 1,
      max_attempts: 3,
      attempt_count: 0,
      items_processed: 0,
      items_total: 1,
      metadata: { retry_source: 'image_retry_processor' },
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (jobError || !jobRow) {
    throw new Error(
      `Failed to create scrape job for reauthenticate: ${jobError?.message ?? 'unknown error'}`
    );
  }

  const jobId = jobRow.id as string;

  // Create a single chunk for the SKU
  const { error: chunkError } = await supabase.from('scrape_job_chunks').insert({
    job_id: jobId,
    chunk_index: 0,
    skus: [sku],
    scrapers: [scraperSlug],
    status: 'pending',
    planned_work_units: 1,
    updated_at: nowIso,
  });

  if (chunkError) {
    // Best-effort cleanup
    await supabase.from('scrape_jobs').delete().eq('id', jobId);
    throw new Error(
      `Failed to create scrape job chunk for reauthenticate: ${chunkError.message}`
    );
  }

  console.log(
    `[ImageRetryReauthenticate] Queued scrape job ${jobId} for sku=${sku} scraper=${scraperSlug}`
  );

  // Return the existing session path but with a null expiry,
  // signalling that the retry processor should not expect a local
  // browser state file to be valid.
  return {
    ...session,
    sessionExpiresAt: null,
  };
}
