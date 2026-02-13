import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
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

    const { data: config, error } = await client
      .from('scraper_configs')
      .select('*, scraper_config_versions(*)')
      .eq('id', id)
      .single();

    if (error || !config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const versions = (config.scraper_config_versions || []).sort((a: Record<string, number>, b: Record<string, number>) => 
      b.version_number - a.version_number
    );

    return NextResponse.json({
      ...config,
      versions,
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
