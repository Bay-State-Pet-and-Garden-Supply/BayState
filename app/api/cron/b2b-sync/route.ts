import { NextRequest, NextResponse } from 'next/server';
import { triggerSync, getB2BFeeds, getCredentials } from '@/lib/b2b/sync-service';
import { B2BFactory } from '@/lib/b2b/factory';
import { B2BConfig, DistributorCode } from '@/lib/b2b/types';
import { getFeedType } from '@/lib/b2b/credential-schema';

/**
 * Vercel Cron endpoint for B2B feed synchronization
 * 
 * This endpoint is called by Vercel's cron job system.
 * It checks which feeds are scheduled for the current time and triggers syncs.
 * 
 * Security: Protected by CRON_SECRET environment variable
 * 
 * Schedule (vercel.json):
 * - Every hour: Check feeds with 'hourly' frequency
 * - Every day at 2 AM: Check feeds with 'daily' frequency
 * - Every Sunday at 3 AM: Check feeds with 'weekly' frequency
 */

export async function GET(request: NextRequest) {
  // 1. Verify CRON_SECRET for authentication
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;
  
  if (!expectedSecret) {
    console.error('[Cron] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron job not configured' },
      { status: 500 }
    );
  }
  
  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[Cron] Unauthorized cron request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // 2. Get current time info
    const now = new Date();
    const hour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay();
    const isHourly = hour >= 0 && hour < 24; // Always check on hourly cron
    
    console.log(`[Cron] Starting B2B sync at ${now.toISOString()}`);
    console.log(`[Cron] Hour: ${hour}, Day of week: ${dayOfWeek}`);

    // 3. Get all feeds and their schedule configurations
    const feeds = await getB2BFeeds();
    
    // 4. Determine which feeds should sync based on schedule
    const feedsToSync: DistributorCode[] = [];
    
    for (const feed of feeds) {
      if (!feed.enabled) {
        console.log(`[Cron] Skipping ${feed.distributor_code}: disabled`);
        continue;
      }

      // Get schedule configuration from app_settings or use feed's sync_frequency
      const scheduleConfig = await getScheduleConfig(feed.distributor_code);
      const frequency = scheduleConfig?.frequency || feed.sync_frequency || 'manual';
      const scheduledHour = scheduleConfig?.scheduledHour ?? 2; // Default to 2 AM UTC

      let shouldSync = false;
      
      switch (frequency) {
        case 'hourly':
          // Sync every hour if enabled
          shouldSync = isHourly;
          break;
        case 'daily':
          // Sync at the scheduled hour
          shouldSync = hour === scheduledHour;
          break;
        case 'weekly':
          // Sync on the scheduled day (Sunday = 0) at the scheduled hour
          shouldSync = dayOfWeek === 0 && hour === scheduledHour;
          break;
        case 'manual':
        default:
          shouldSync = false;
      }

      if (shouldSync) {
        feedsToSync.push(feed.distributor_code);
      }
    }

    console.log(`[Cron] Feeds to sync: ${feedsToSync.join(', ')}`);

    // 5. Trigger syncs for selected feeds
    const results: Record<string, { success: boolean; productsFetched?: number; error?: string }> = {};
    
    for (const distributorCode of feedsToSync) {
      try {
        console.log(`[Cron] Starting sync for ${distributorCode}`);
        
        const result = await triggerSync(distributorCode, 'catalog');
        
        results[distributorCode] = {
          success: result.success,
          productsFetched: result.productsFetched,
          error: result.error,
        };
        
        console.log(`[Cron] ${distributorCode} sync complete: ${result.success ? `${result.productsFetched} products` : result.error}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Cron] ${distributorCode} sync failed: ${message}`);
        results[distributorCode] = {
          success: false,
          error: message,
        };
      }
    }

    // 6. Return results
    const successfulSyncs = Object.values(results).filter(r => r.success).length;
    const failedSyncs = Object.values(results).filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      feedsTriggered: feedsToSync.length,
      results,
      summary: {
        total: feedsToSync.length,
        successful: successfulSyncs,
        failed: failedSyncs,
      },
    });
  } catch (error) {
    console.error('[Cron] B2B sync cron job failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Cron job failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Get schedule configuration for a distributor
 */
async function getScheduleConfig(distributorCode: string): Promise<{ frequency: string; scheduledHour?: number } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', `b2b_${distributorCode.toLowerCase()}_schedule`)
      .single();

    if (data?.value) {
      return JSON.parse(data.value);
    }
    return null;
  } catch {
    return null;
  }
}

function createClient() {
  // Dynamic import to avoid server-only issues
  return import('@/lib/supabase/server').then(mod => mod.createClient());
}
