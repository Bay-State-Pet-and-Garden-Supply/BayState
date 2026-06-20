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
});

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  try {
    const { data: groups, error } = await supabase
      .from('product_groups')
      .select('*')
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get count of members for each group
    const { data: memberCounts, error: countError } = await supabase
      .from('product_group_products')
      .select('group_id');

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const countsMap = new Map<string, number>();
    for (const member of memberCounts || []) {
      const current = countsMap.get(member.group_id) || 0;
      countsMap.set(member.group_id, current + 1);
    }

    const responseGroups = groups.map((g) => ({
      ...g,
      member_count: countsMap.get(g.id) || 0,
    }));

    return NextResponse.json({ groups: responseGroups });
  } catch (error) {
    console.error('Failed to list product groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  try {
    const body = await request.json();
    const validatedData = productGroupSchema.parse(body);

    const { data: group, error } = await supabase
      .from('product_groups')
      .insert(validatedData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error('Failed to create product group:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
