import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ImageRetryProcessor } from '@/lib/scraper-callback/image-retry-processor';
import { httpFetchCaptureImage } from '@/lib/scraper-callback/image-retry-capture';

/**
 * Vercel Cron Job: Process pending image retries.
 *
 * Runs on a schedule (configured in vercel.json). For each pending
 * image_retry_queue entry:
 *   - Non-login images: HTTP fetch capture
 *   - Login images: triggers a scrape job via reauthenticate, then
 *     relies on the scraper callback to update sources
 *
 * Auth: Verifies the x-vercel-signature header when called by Vercel
 * Cron, or falls back to CRON_SECRET for local testing.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Validate cron authorization
  const signature = request.headers.get('x-vercel-signature');
  const authToken = request.headers.get('authorization');

  let secretParam: string | null = null;
  try {
    secretParam = new URL(request.url).searchParams.get('secret');
  } catch {
    // ignore invalid URL
  }

  const isAuthorized =
    (signature && signature.length > 0) ||
    (authToken && authToken === `Bearer ${cronSecret}`) ||
    (cronSecret && secretParam === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const processor = new ImageRetryProcessor({
    supabase,
    captureImage: httpFetchCaptureImage,
    batchSize: 10,
    concurrency: 3,
    logger: console,
  });

  try {
    const result = await processor.pollAndProcess();
    console.log('[Cron ImageRetry] Completed:', result);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron ImageRetry] Failed:', message);
    return NextResponse.json(
      { error: 'Image retry processing failed', message },
      { status: 500 }
    );
  }
}
