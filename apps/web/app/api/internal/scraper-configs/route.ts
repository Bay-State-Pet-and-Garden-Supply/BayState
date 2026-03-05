import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  try {
    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: configs, error } = await supabase
      .from('scraper_configs')
      .select(`
        slug,
        display_name,
        domain,
        schema_version,
        scraper_config_versions!current_version_id (
          version_number,
          published_at
        )
      `)
      .order('slug', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    const publishedConfigs = (configs || []).filter(
      (config: Record<string, unknown>) => 
        (config.scraper_config_versions as Record<string, unknown>)?.status === 'published'
    );

    const formattedConfigs = publishedConfigs.map((config: Record<string, unknown>) => ({
      slug: config.slug,
      display_name: config.display_name,
      domain: config.domain,
      version_number: (config.scraper_config_versions as Record<string, number>)?.version_number || null,
      published_at: (config.scraper_config_versions as Record<string, string>)?.published_at || null,
    }));

    return NextResponse.json({
      data: formattedConfigs,
      count: formattedConfigs.length,
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
