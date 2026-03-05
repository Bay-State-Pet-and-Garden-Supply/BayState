import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export interface AnalyticsData {
  period: {
    start: string;
    end: string;
    label: string;
  };
  revenue: {
    total: number;
    orderCount: number;
    averageOrderValue: number;
  };
  revenueByDay: Array<{
    date: string;
    revenue: number;
    orders: number;
  }>;
  ordersByStatus: Array<{
    status: string;
    count: number;
  }>;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

/**
 * GET /api/admin/analytics
 * Fetches analytics data with date range filtering.
 *
 * Query params:
 * - range: 'today' | '7days' | '30days' | 'custom'
 * - start: ISO date string (required for custom range)
 * - end: ISO date string (required for custom range)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const range = searchParams.get('range') || '7days';
  let startDate: Date;
  let endDate = new Date();
  let label = '';

  // Calculate date range
  const now = new Date();
  switch (range) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      label = 'Today';
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      label = 'Last 7 days';
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      label = 'Last 30 days';
      break;
    case 'custom': {
      const customStart = searchParams.get('start');
      const customEnd = searchParams.get('end');
      if (!customStart || !customEnd) {
        return NextResponse.json(
          { error: 'start and end dates required for custom range' },
          { status: 400 }
        );
      }
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
      label = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
      break;
    }
    case 'all':
      startDate = new Date(0); // Epoch start
      label = 'All Time';
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      label = 'Last 7 days';
  }

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  try {
    // Fetch aggregated analytics data from database via RPC
    const { data: analyticsResult, error: rpcError } = await supabase.rpc('get_store_analytics', {
      start_date: startIso,
      end_date: endIso
    });

    if (rpcError) {
      console.error('Error calling analytics RPC:', rpcError);
      return NextResponse.json(
        { error: 'Failed to calculate analytics' },
        { status: 500 }
      );
    }

    const analyticsData: AnalyticsData = {
      period: {
        start: startIso,
        end: endIso,
        label,
      },
      ...analyticsResult
    };

    return NextResponse.json(analyticsData);
  } catch (err) {
    console.error('Analytics error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
