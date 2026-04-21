import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CohortMember {
  product_sku: string;
  upc_prefix: string;
  sort_order: number;
}

function toOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const supabase = await createClient();
  const includeMembers = request.nextUrl.searchParams.get('include_members') === 'true';

  // Fetch cohort with brand join
  const { data: cohort, error } = await supabase
    .from('cohort_batches')
    .select('*, brands(id, name, slug, logo_url, website_url, official_domains, preferred_domains)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Cohort not found' },
        { status: 404 }
      );
    }
    console.error('[Cohorts API] Error fetching cohort:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Fetch member products only if requested
  let members: CohortMember[] = [];
  let memberProducts: Array<{ sku: string; pipeline_status: string; input: unknown }> = [];

  if (includeMembers) {
    const { data: memberData } = await supabase
      .from('cohort_members')
      .select('product_sku, upc_prefix, sort_order')
      .eq('cohort_id', id)
      .order('sort_order');
    
    members = (memberData as CohortMember[]) || [];

    // Fetch pipeline status for each member
    const memberSkus = members.map((m) => m.product_sku);
    if (memberSkus.length > 0) {
      const { data: products } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status, input')
        .in('sku', memberSkus);
      memberProducts = (products || []) as typeof memberProducts;
    }
  }

  return NextResponse.json({
    cohort,
    members,
    member_products: memberProducts,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const body = await request.json();
  const supabase = await createClient();

  // Build update payload — only allow specific fields
  const updatePayload: Record<string, unknown> = {};

  if ('brand_id' in body || 'brand_name' in body) {
    const brandId = toOptionalTrimmedString(body.brand_id);
    const brandName = toOptionalTrimmedString(body.brand_name);

    if (brandId) {
      updatePayload.brand_id = brandId;
      updatePayload.brand_name = null;
    } else if (brandName) {
      updatePayload.brand_id = null;
      updatePayload.brand_name = brandName;
    } else {
      updatePayload.brand_id = null;
      updatePayload.brand_name = null;
    }
  }

  if ('product_line' in body) {
    updatePayload.product_line = typeof body.product_line === 'string' ? body.product_line.trim() || null : null;
  }

  if ('name' in body) {
    updatePayload.name = typeof body.name === 'string' ? body.name.trim() || null : null;
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  }

  const { data: updated, error } = await supabase
    .from('cohort_batches')
    .update(updatePayload)
    .eq('id', id)
    .select('*, brands(id, name, slug, logo_url, website_url, official_domains, preferred_domains)')
    .single();

  if (error) {
    console.error('[Cohorts API] Error updating cohort:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ cohort: updated });
}
