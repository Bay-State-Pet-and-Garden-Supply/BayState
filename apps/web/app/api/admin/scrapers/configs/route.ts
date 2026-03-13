import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const configs = await getLocalScraperConfigs();

    return NextResponse.json({ configs });
  } catch (err) {
    console.error('Error in scraper configs API:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
