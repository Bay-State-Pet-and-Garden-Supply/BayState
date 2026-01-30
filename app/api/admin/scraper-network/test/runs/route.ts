import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MAX_HISTORICAL_RUNS = 100;
const RETENTION_DAYS = 30;

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(url, key);
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/scraper-network/test/runs
 *
 * Fetches historical test runs with optional filtering and pagination.
 *
 * Query parameters:
 * - limit: Maximum number of runs to return (default: 100, max: 100)
 * - scraper_id: Filter by scraper ID
 * - status: Filter by status (passed, failed, partial, running, pending, cancelled)
 * - from_date: Filter runs created after this date (ISO format)
 * - to_date: Filter runs created before this date (ISO format)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    let limit = parseInt(searchParams.get('limit') || String(MAX_HISTORICAL_RUNS), 10);
    limit = Math.min(Math.max(1, limit), MAX_HISTORICAL_RUNS);

    const scraperId = searchParams.get('scraper_id');
    const status = searchParams.get('status');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    // Build query
    let query = supabase
      .from('scraper_test_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (scraperId) {
      query = query.eq('scraper_id', scraperId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    // Apply 30-day retention filter (default, can be overridden by from_date)
    if (!fromDate) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
      query = query.gte('created_at', cutoffDate.toISOString());
    }

    const { data: runs, error } = await query;

    if (error) {
      console.error('[TestRuns API] Error fetching runs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch test runs' },
        { status: 500 }
      );
    }

    // Transform runs to include computed fields
    const transformedRuns = (runs || []).map((run) => ({
      id: run.id,
      scraper_id: run.scraper_id,
      scraper_name: run.scraper_name || null,
      test_type: run.test_type || 'manual',
      status: run.status || 'pending',
      created_at: run.created_at,
      duration_ms: run.duration_ms,
      skus_tested: (run.skus_tested as string[]) || [],
      passed_count: run.passed_count || 0,
      failed_count: run.failed_count || 0,
      error_message: run.error_message || null,
    }));

    return NextResponse.json({
      runs: transformedRuns,
      count: transformedRuns.length,
      limit,
      retention_days: RETENTION_DAYS,
    });
  } catch (error) {
    console.error('[TestRuns API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
