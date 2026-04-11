import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';
import {
  buildProductImageStorageFolder,
  replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';
import {
  validateStatusTransition,
} from '@/lib/pipeline';
import {
  PERSISTED_PIPELINE_STATUSES,
  isPersistedStatus,
  type PersistedPipelineStatus,
} from '@/lib/pipeline/types';

const CANONICAL_PERSISTED_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
  (status) => `'${status}'`
).join(', ');

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
      pipeline_status?: string;
      sources?: Record<string, unknown>;
    };

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (consolidated !== undefined) {
      if (consolidated && typeof consolidated === 'object' && !Array.isArray(consolidated)) {
        const durableConsolidated = await replaceInlineImageDataUrls(
          supabase,
          consolidated as Record<string, unknown>,
          {
            folderPath: buildProductImageStorageFolder('pipeline-consolidated', sku),
            onError: (message, error) => {
              console.error(`[Pipeline SKU] ${message}`, error);
            },
          }
        );
        updateData.consolidated = durableConsolidated.value;
      } else {
        updateData.consolidated = consolidated;
      }
    }

    if (sources !== undefined) {
      updateData.sources = sources;
    }

    if (pipeline_status !== undefined) {
      if (pipeline_status === 'published') {
        return NextResponse.json(
          {
            error: 'Published is no longer a pipeline status. Use /api/admin/pipeline/publish and manage synced products from the export tab.',
          },
          { status: 400 }
        );
      }

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

      const currentStatus = currentRow.pipeline_status as string;
      const targetStatus = pipeline_status;

      if (!isPersistedStatus(currentStatus)) {
        return NextResponse.json(
          {
            error: `Invalid current pipeline status. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}`,
          },
          { status: 400 }
        );
      }

      if (!isPersistedStatus(targetStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition to '${targetStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}`,
          },
          { status: 400 }
        );
      }

      if (!validateStatusTransition(currentStatus, targetStatus)) {
        const allowedTargets = [currentStatus, ...PERSISTED_PIPELINE_STATUSES]
          .filter((status, index, all): status is PersistedPipelineStatus => all.indexOf(status) === index)
          .filter((status) => validateStatusTransition(currentStatus, status));

        return NextResponse.json(
          {
            error: `Invalid status transition to '${targetStatus}'. Allowed target states: ${allowedTargets
              .map((status) => `'${status}'`)
              .join(', ')}`,
          },
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

    revalidatePath('/admin/pipeline');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error parsing request:', err);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
