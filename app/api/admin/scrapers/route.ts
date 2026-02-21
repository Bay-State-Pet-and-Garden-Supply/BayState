import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type CurrentVersionRow = {
  status?: string | null;
};

type ScraperRow = {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  scraper_config_versions: CurrentVersionRow | null;
};

export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase
      .from('scraper_configs')
      .select(
        `
          id,
          slug,
          display_name,
          domain,
          scraper_config_versions!fk_current_version (
            status
          )
        `
      )
      .order('slug', { ascending: true });

    if (error) {
      console.error('[Admin Scrapers API] Failed to fetch scrapers:', error);
      return NextResponse.json({ error: 'Failed to fetch scrapers' }, { status: 500 });
    }

    const scrapers =
      (data as ScraperRow[] | null)?.map((row) => {
        const versionStatus = row.scraper_config_versions?.status ?? 'draft';
        return {
          id: row.id,
          slug: row.slug,
          name: row.display_name || row.slug,
          description: row.domain,
          status: versionStatus === 'published' ? 'operational' : versionStatus,
        };
      }) ?? [];

    return NextResponse.json(scrapers);
  } catch (error) {
    console.error('[Admin Scrapers API] Request failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
