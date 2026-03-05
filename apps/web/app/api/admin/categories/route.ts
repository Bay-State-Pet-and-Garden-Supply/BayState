import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

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

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  if (!body.slug || typeof body.slug !== 'string') {
    return NextResponse.json(
      { error: 'Slug is required' },
      { status: 400 }
    );
  }

  // Build insert object
  const insertData = {
    name: body.name,
    slug: body.slug,
    description: body.description || null,
    parent_id: body.parent_id || null,
    display_order: body.display_order ?? 0,
    image_url: body.image_url || null,
    is_featured: body.is_featured ?? false,
  };

  const { data, error } = await supabase
    .from('categories')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    // Check for unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A category with this slug already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ category: data }, { status: 201 });
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order')
    .order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ categories: data });
}
