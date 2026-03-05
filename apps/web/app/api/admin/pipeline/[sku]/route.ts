import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { sku } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products_ingestion')
    .select('*')
    .eq('sku', sku)
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Product not found' },
      { status: 404 }
    );
  }

  const consolidated = (data.consolidated && typeof data.consolidated === 'object')
    ? (data.consolidated as Record<string, unknown>)
    : {};

  const consolidatedImages = Array.isArray(consolidated.images)
    ? consolidated.images.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const sourceImageCandidates = extractImageCandidatesFromSources(data.sources, 24);

  const mergedCandidates = Array.from(new Set([...consolidatedImages, ...sourceImageCandidates]));

  return NextResponse.json({
    product: {
      ...data,
      image_candidates: mergedCandidates,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { sku } = await params;
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { consolidated, pipeline_status } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (consolidated !== undefined) {
      updateData.consolidated = consolidated;
    }

    if (pipeline_status !== undefined) {
      updateData.pipeline_status = pipeline_status;
    }

    const { error } = await supabase
      .from('products_ingestion')
      .update(updateData)
      .eq('sku', sku);

    if (error) {
      console.error('Error updating product:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error parsing request:', err);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
