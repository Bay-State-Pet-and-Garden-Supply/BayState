import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const productGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  description: z.string().optional().nullable(),
  hero_image_url: z.string().url().optional().or(z.literal('')).nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  is_active: z.coerce.boolean().default(true),
  default_product_id: z.string().uuid().optional().nullable(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  try {
    const body = await request.json();
    const validatedData = productGroupSchema.parse(body);

    const { data: group, error } = await supabase
      .from('product_groups')
      .update(validatedData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Failed to update product group:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  try {
    const { error } = await supabase
      .from('product_groups')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete product group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  try {
    const { data: group, error } = await supabase
      .from('product_groups')
      .select('*, brand:brands(id, name)')
      .eq('id', id)
      .single();

    if (error || !group) {
      return NextResponse.json({ error: error?.message || 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Failed to get product group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
