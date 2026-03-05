import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await createClient();

    const { data: config, error: configError } = await client
      .from('scraper_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const { data: version, error: versionError } = await client
      .from('scraper_config_versions')
      .select('*')
      .eq('id', config.current_version_id)
      .single();

    if (versionError || !version) {
      return NextResponse.json({ error: 'Configuration version not found' }, { status: 404 });
    }

    return NextResponse.json({
      config: version.config,
      status: version.status,
      version: version.version_number,
      versionId: version.id,
      validationResult: version.validation_result,
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
