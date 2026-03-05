import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createClient();

  // First, check if category has children
  const { data: children } = await supabase
    .from('categories')
    .select('id')
    .eq('parent_id', id);

  // Delete children first (cascade delete)
  if (children && children.length > 0) {
    const childIds = children.map((c) => c.id);
    const { error: childError } = await supabase
      .from('categories')
      .delete()
      .in('id', childIds);

    if (childError) {
      console.error('Error deleting child categories:', childError);
      return NextResponse.json(
        { error: childError.message },
        { status: 500 }
      );
    }
  }

  // Delete the category itself
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Category not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ category: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
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
  if (body.name !== undefined && typeof body.name !== 'string') {
    return NextResponse.json(
      { error: 'Name must be a string' },
      { status: 400 }
    );
  }

  // Build update object with allowed fields
  const updateData: Record<string, unknown> = {};
  const allowedFields = [
    'name',
    'slug',
    'description',
    'parent_id',
    'display_order',
    'image_url',
    'is_featured',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating category:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ category: data });
}
