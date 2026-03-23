import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';
import {
  isLegacyPipelineStatus,
  toNewPipelineStatus,
  validateStatusTransition,
  type TransitionalPipelineStatus,
} from '@/lib/pipeline';
import type { PipelineStatus } from '@/lib/pipeline/types';

function toImageUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractSelectedImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'url' in entry) {
        const url = (entry as { url?: unknown }).url;
        return typeof url === 'string' ? url : null;
      }
      return null;
    })
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

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

  const consolidatedImages = toImageUrlArray(consolidated.images);
  const storedImageCandidates = toImageUrlArray(data.image_candidates);
  const selectedImageUrls = extractSelectedImageUrls(data.selected_images);
  const sourceImageCandidates = extractImageCandidatesFromSources(data.sources, 24);

  const mergedCandidates = Array.from(
    new Set([
      ...storedImageCandidates,
      ...consolidatedImages,
      ...selectedImageUrls,
      ...sourceImageCandidates,
    ]),
  );

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
    const { consolidated, pipeline_status, sources } = body as {
      consolidated?: unknown;
      pipeline_status?: TransitionalPipelineStatus;
      sources?: Record<string, unknown>;
    };

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (consolidated !== undefined) {
      updateData.consolidated = consolidated;
    }

    if (sources !== undefined) {
      updateData.sources = sources;
    }

    if (pipeline_status !== undefined) {
      const { data: currentRow, error: fetchError } = await supabase
        .from('products_ingestion')
        .select('pipeline_status')
        .eq('sku', sku)
        .single();

      if (fetchError || !currentRow) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      const currentStatus = currentRow.pipeline_status as PipelineStatus;
      const targetStatus = isLegacyPipelineStatus(pipeline_status)
        ? toNewPipelineStatus(pipeline_status)
        : pipeline_status;

      if (!validateStatusTransition(currentStatus, targetStatus)) {
        return NextResponse.json(
          { error: `Invalid transition from '${currentStatus}' to '${targetStatus}'` },
          { status: 400 }
        );
      }

      updateData.pipeline_status = targetStatus;
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
