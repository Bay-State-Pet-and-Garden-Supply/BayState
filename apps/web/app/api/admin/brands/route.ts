import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug')
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
    const { name } = await request.json();
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const slug = name.toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const { data, error } = await supabase
      .from('brands')
      .insert([{ name: name.trim(), slug }])
      .select('id, name, slug')
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
