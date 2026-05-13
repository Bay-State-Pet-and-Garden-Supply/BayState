import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';

const SETTINGS_KEY = 'enrichment_defaults';

interface EnrichmentDefaults {
  enabled_sources: string[];
  priority_order: string[];
  updated_at?: string;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

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
