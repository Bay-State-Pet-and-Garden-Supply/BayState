import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';

const SETTINGS_KEY = 'enrichment_defaults';

interface EnrichmentDefaults {
  enabled_sources: string[];
  priority_order: string[];
  updated_at?: string;
}

/**
 * GET /api/admin/enrichment/defaults
 * Fetch global enrichment defaults and all available sources
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch sources and defaults in parallel
    const [sources, { data: settingsRow }] = await Promise.all([
      getAllSources(),
      supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single(),
    ]);

    const defaults: EnrichmentDefaults = settingsRow?.value as EnrichmentDefaults || {
      enabled_sources: sources.filter((s) => s.enabled).map((s) => s.id),
      priority_order: [],
    };

    return NextResponse.json({
      sources,
      defaults,
    });
  } catch (error) {
    console.error('Failed to fetch enrichment defaults:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrichment defaults' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/enrichment/defaults
 * Update global enrichment defaults
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { enabled_sources, priority_order } = body;

    if (!Array.isArray(enabled_sources)) {
      return NextResponse.json(
        { error: 'enabled_sources must be an array' },
        { status: 400 }
      );
    }

    const newDefaults: EnrichmentDefaults = {
      enabled_sources,
      priority_order: priority_order || [],
      updated_at: new Date().toISOString(),
    };

    // Upsert into site_settings
    const { error } = await supabase
      .from('site_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: newDefaults,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      console.error('Failed to save enrichment defaults:', error);
      return NextResponse.json(
        { error: 'Failed to save enrichment defaults' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, defaults: newDefaults });
  } catch (error) {
    console.error('Failed to save enrichment defaults:', error);
    return NextResponse.json(
      { error: 'Failed to save enrichment defaults' },
      { status: 500 }
    );
  }
}
