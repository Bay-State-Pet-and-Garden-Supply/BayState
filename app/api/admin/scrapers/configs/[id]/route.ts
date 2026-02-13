import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('*, scraper_config_versions(*)')
      .eq('id', id)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      );
    }

    const currentVersionId = config.current_version_id;
    const currentVersion = config.scraper_config_versions.find(
      (v: { id: string }) => v.id === currentVersionId
    );

    if (!currentVersion) {
      return NextResponse.json(
        { error: 'Configuration version not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      config: currentVersion.config,
      status: currentVersion.status,
      version: currentVersion.version_number,
      validationResult: currentVersion.validation_result,
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
