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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = await createClient();

    let query = client
      .from('scraper_config_versions')
      .select(`
        id,
        version_number,
        status,
        published_at,
        published_by,
        change_summary,
        created_at,
        created_by
      `)
      .eq('config_id', id)
      .order('version_number', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: versions, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
    }

    const { count } = await client
      .from('scraper_config_versions')
      .select('*', { count: 'exact', head: true })
      .eq('config_id', id);

    return NextResponse.json({
      data: versions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (versions?.length || 0) === limit,
      },
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
