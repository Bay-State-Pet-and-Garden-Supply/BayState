import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  buildTaxonomyNodes,
  type TaxonomyCategoryRecord,
} from '@/lib/taxonomy';

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

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

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('include_inactive') === 'true';

  const supabase = await createAdminClient();

  let query = supabase.from('categories').select('*');
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query
    .order('display_order')
    .order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const categoryRows = (data || []) as TaxonomyCategoryRecord[];
  const taxonomyNodes = buildTaxonomyNodes(categoryRows);
  const nodeById = new Map(taxonomyNodes.map((node) => [node.id, node]));

  return NextResponse.json({
    categories: categoryRows.map((category) => {
      const node = nodeById.get(category.id);
      return {
        ...category,
        breadcrumb: node?.breadcrumb ?? category.name,
        depth: node?.depth ?? 0,
        is_leaf: node?.is_leaf ?? true,
      };
    }),
  });
}
