import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, logo_url, description, website_url, official_domains, preferred_domains, created_at')
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

export async function POST(request: Request) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  try {
    const { name, slug: requestedSlug, logo_url, description, website_url, official_domains, preferred_domains } = await request.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const slug = (typeof requestedSlug === 'string' && requestedSlug.trim().length > 0 ? requestedSlug : name).toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const normalizeDomains = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
    };

    const { data, error } = await supabase
      .from('brands')
      .insert([{
        name: name.trim(),
        slug,
        logo_url: typeof logo_url === 'string' && logo_url.trim().length > 0 ? logo_url.trim() : null,
        description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
        website_url: typeof website_url === 'string' && website_url.trim().length > 0 ? website_url.trim() : null,
        official_domains: normalizeDomains(official_domains),
        preferred_domains: normalizeDomains(preferred_domains),
      }])
      .select('id, name, slug, logo_url, description, website_url, official_domains, preferred_domains, created_at')
      .single();

    if (error) {
      console.error('Error creating brand:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ brand: data });
  } catch (err) {
    console.error('Failed to create brand:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
