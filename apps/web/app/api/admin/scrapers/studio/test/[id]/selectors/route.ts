import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

interface SelectorResult {
  id: string;
  selector_name: string;
  selector_value: string;
  status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
  count: number;
  error_message: string | null;
  duration_ms: number | null;
  sku: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const adminClient = getSupabaseAdmin();

    const { data: testRun, error: testRunError } = await adminClient
      .from('scraper_test_runs')
      .select('id')
      .eq('id', id)
      .single();

    if (testRunError || !testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    const { data: selectorResults, error: selectorsError } = await adminClient
      .from('scraper_selector_results')
      .select('*')
      .eq('test_run_id', id)
      .order('created_at', { ascending: true });

    if (selectorsError) {
      console.error('[Studio Selectors API] Error fetching selector results:', selectorsError);
      return NextResponse.json(
        { error: 'Failed to fetch selector results' },
        { status: 500 }
      );
    }

    const typedSelectors: SelectorResult[] = (selectorResults || []).map((sel) => ({
      id: sel.id,
      selector_name: sel.selector_name,
      selector_value: sel.selector_value,
      status: sel.status as SelectorResult['status'],
      count: 1,
      error_message: sel.error_message,
      duration_ms: sel.duration_ms,
      sku: sel.sku,
    }));

    return NextResponse.json({
      test_run_id: id,
      selectors: typedSelectors,
      total: typedSelectors.length,
    });

  } catch (error) {
    console.error('[Studio Selectors API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
