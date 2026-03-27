import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import type { ImageRetryQueueRow } from '@/lib/supabase/database.types';
import { resolveImageRetryTarget } from '@/lib/scraper-callback/image-retry-processor';

interface RetryImageRequestBody {
  product_id?: string;
  image_url?: string;
}

function buildAcceptedResponse(queued: boolean, reason?: string) {
  return NextResponse.json({ accepted: true, queued, reason }, { status: 202 });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createClient();

  try {
    const body = (await request.json()) as RetryImageRequestBody;
    const productId = body.product_id?.trim();
    const imageUrl = body.image_url?.trim();

    if (!productId || !imageUrl) {
      return NextResponse.json(
        { error: 'product_id and image_url are required' },
        { status: 400 }
      );
    }

    const target = await resolveImageRetryTarget(supabase, productId, imageUrl);

    if (!target) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (!target.requiresLogin) {
      return buildAcceptedResponse(false, 'Source does not require login');
    }

    const nowIso = new Date().toISOString();
    const { data: existingRows, error: existingError } = await supabase
      .from('image_retry_queue')
      .select('*')
      .eq('product_id', productId)
      .eq('image_url', imageUrl)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw new Error(`Failed to load retry queue entry: ${existingError.message}`);
    }

    const existingEntry = (existingRows?.[0] ?? null) as ImageRetryQueueRow | null;

    if (existingEntry) {
      const { error: updateError } = await supabase
        .from('image_retry_queue')
        .update({
          error_type: 'not_found_404',
          status: 'pending',
          scheduled_for: nowIso,
          last_error: null,
          updated_at: nowIso,
        })
        .eq('id', existingEntry.id);

      if (updateError) {
        throw new Error(`Failed to update retry queue entry: ${updateError.message}`);
      }

      return buildAcceptedResponse(true);
    }

    const { error: insertError } = await supabase.from('image_retry_queue').insert({
      product_id: productId,
      image_url: imageUrl,
      error_type: 'not_found_404',
      status: 'pending',
      retry_count: 0,
      scheduled_for: nowIso,
      last_error: null,
      updated_at: nowIso,
    });

    if (insertError) {
      throw new Error(`Failed to create retry queue entry: ${insertError.message}`);
    }

    return buildAcceptedResponse(true);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    console.error('[Retry Image API] Failed to enqueue retry', error);
    return NextResponse.json({ error: 'Failed to enqueue image retry' }, { status: 500 });
  }
}
