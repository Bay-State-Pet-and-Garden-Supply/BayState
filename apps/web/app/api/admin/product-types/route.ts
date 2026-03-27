import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { normalizeProductTypeOptions } from '@/lib/facets/normalization';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_types')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching product types:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ productTypes: normalizeProductTypeOptions(data || []) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  const name = body.name.trim();

  // Check if it already exists
  const { data: existing } = await supabase
    .from('product_types')
    .select('id, name')
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ productType: existing });
  }

  const { data, error } = await supabase
    .from('product_types')
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error('Error creating product type:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ productType: data }, { status: 201 });
}
