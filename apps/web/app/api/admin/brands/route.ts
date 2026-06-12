import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, logo_url, description, official_domains, preferred_domains, source_cascade_configured_at, source_cascade_configured_by, created_at')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching brands:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ brands: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const { name, slug: requestedSlug, logo_url, description, official_domains, preferred_domains } = await request.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const slug = (typeof requestedSlug === 'string' && requestedSlug.trim().length > 0 ? requestedSlug : name).toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const normalizeValues = (value: unknown, toLower = true): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => toLower ? item.trim().toLowerCase() : item.trim())
        .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
    };

    const { data, error } = await supabase
      .from('brands')
      .insert([{
        name: name.trim(),
        slug,
        logo_url: typeof logo_url === 'string' && logo_url.trim().length > 0 ? logo_url.trim() : null,
        description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
        official_domains: normalizeValues(official_domains, true),
        preferred_domains: [],
      }])
      .select('id, name, slug, logo_url, description, official_domains, preferred_domains, source_cascade_configured_at, source_cascade_configured_by, created_at')
      .single();

    if (error) {
      console.error('Error creating brand:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-sync official brand source in brand_sources
    await syncOfficialBrandSource(supabase, data.id, data.slug, data.name, data.official_domains ?? []);

    return NextResponse.json({ brand: data });
  } catch (err) {
    console.error('Failed to create brand:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

async function syncOfficialBrandSource(
  supabase: any,
  brandId: string,
  slug: string,
  name: string,
  officialDomains: string[]
): Promise<void> {
  if (!officialDomains || officialDomains.length === 0) {
    // If no official domains are set, remove any existing official_brand source for this brand
    const { error } = await supabase
      .from('brand_sources')
      .delete()
      .eq('brand_id', brandId)
      .eq('source_type', 'official_brand');
    
    if (error) {
      console.error('Error deleting official brand source during sync:', error);
    }
    return;
  }

  // Upsert the official_brand source
  const sourceData = {
    brand_id: brandId,
    source_type: 'official_brand',
    source_slug: slug,
    display_name: name,
    domains: officialDomains,
    asset_domains: [],
    crawl4ai_adapter_slug: 'crawl4ai_direct',
    requires_auth: false,
    credential_ref: null,
    search_mode: 'domain_search',
    allowed_fields: ['title', 'description', 'images', 'ingredients', 'guaranteed_analysis', 'category'],
    priority: 50,
    enabled: true,
  };

  const { error } = await supabase
    .from('brand_sources')
    .upsert(sourceData, {
      onConflict: 'brand_id,source_type,source_slug'
    });

  if (error) {
    console.error('Error upserting official brand source during sync:', error);
  }
}
