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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('id, slug, schema_version')
      .eq('slug', slug)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Scraper config not found' }, { status: 404 });
    }

    const { data: version, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select(`
        id,
        version_number,
        status,
        schema_version,
        config,
        published_at,
        published_by
      `)
      .eq('config_id', config.id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: 'No published version available for this scraper' },
        { status: 404 }
      );
    }

    const response = {
      schema_version: version.schema_version,
      slug: config.slug,
      version_number: version.version_number,
      status: version.status,
      config: version.config,
      published_at: version.published_at,
      published_by: version.published_by,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
