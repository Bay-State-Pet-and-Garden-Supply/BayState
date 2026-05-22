/**
 * Gemini Batch Orchestration Service
 *
 * Manages the lifecycle of Gemini Batch API consolidation jobs:
 *   - createGeminiBatchJob()     — Insert local batch_jobs + batch_job_items (no provider calls)
 *   - prepareGeminiBatchChunk()  — Upload images for pending items, build final requests
 *   - submitPreparedGeminiBatch() — Upload JSONL → create Gemini batch → set provider IDs
 *   - syncGeminiBatchStatus()    — Poll provider status, download results when complete
 *   - retrieveGeminiBatchResults() — Parse downloaded results into ConsolidationResult[]
 *   - cancelGeminiBatch()        — Cancel at provider level + local DB
 *
 * Design:
 * - Submit route only creates local DB rows (fast, no blocking)
 * - Image prep is chunked through sync/status refreshes
 * - All items in a batch share one provider/model
 * - Stores Gemini file URIs only transiently (48h expiry)
 */

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { createGeminiClient } from './gemini-client';
import { prepareProductImages, uploadJsonlToGemini, clearImageUploadCache } from './image-prep';
import { createGeminiBatchJsonl, parseGeminiBatchOutput } from './multimodal-prompt-builder';
import { parseStructuredConsolidationText } from './result-parsing';
import { calculateAICost } from '@/lib/ai-scraping/pricing';
import { buildPromptContext, generateSystemPrompt } from './prompt-builder';
import type {
  BatchStatus,
  BatchMetadata,
  ConsolidationResult,
  ProductSource,
  SubmitBatchResponse,
  BatchErrorResponse,
  BatchJobItem,
} from './types';
import type { PreparedImagePart } from './image-prep';

// =============================================================================
// Constants
// =============================================================================

const MAX_IMAGES_PER_PRODUCT = 2;
const DEFAULT_PREP_LIMIT = 10;
const POLL_RETRY_DELAY_MS = 5_000;
const MAX_POLL_ATTEMPTS = 10;

// =============================================================================
// Types
// =============================================================================

type GeminiBatchStage =
  | 'preparing'
  | 'submitting'
  | 'in_progress'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

interface GeminiBatchMetadata {
  llm_provider: 'gemini';
  llm_model: string;
  routing_key: string;
  gemini_stage: GeminiBatchStage;
  image_prep_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  image_count: number;
  uploaded_jsonl_file_name?: string;
  uploaded_jsonl_resource_name?: string;
  provider_batch_resource_name?: string;
  provider_output_resource_name?: string;
  provider_error_resource_name?: string;
  file_api_expires_at?: string;
  image_errors?: string[];
  gemini_cache_name?: string;
  [key: string]: unknown;
}

// =============================================================================
// Local Job Creation (Phase 3, Task 12)
// =============================================================================

/**
 * Create a Gemini batch job in the local database.
 * Does NOT call any Gemini API — just inserts DB rows for async processing.
 */
export async function createGeminiBatchJob(
  products: ProductSource[],
  model: string,
  geminiApiKey: string,
  metadata: Record<string, unknown>
): Promise<SubmitBatchResponse | BatchErrorResponse> {
  if (products.length === 0) {
    return { success: false, error: 'No products to consolidate' };
  }

  const supabase = await createAdminClient();
  const batchId = crypto.randomUUID();

  // Construct batch metadata
  const batchMetadata: GeminiBatchMetadata = {
    llm_provider: 'gemini',
    llm_model: model,
    routing_key: (metadata.routing_key as string) || '',
    gemini_stage: 'preparing',
    image_prep_status: 'pending',
    image_count: 0,
    ...metadata,
  };

  // Insert parent batch_jobs row.
  // provider_batch_id is intentionally null until submitPreparedGeminiBatch succeeds.
  // Using a fake ID before provider submission would confuse lookup/UI semantics.
  const { error: insertError } = await supabase.from('batch_jobs').insert({
    id: batchId,
    provider: 'gemini',
    provider_batch_id: null,
    provider_input_file_id: null,
    provider_output_file_id: null,
    provider_error_file_id: null,
    openai_batch_id: null,
    status: 'pending',
    execution_mode: 'gemini_batch',
    description: (metadata.description as string) || `Gemini consolidation batch for ${products.length} products`,
    auto_apply: !!metadata.auto_apply,
    total_requests: products.length,
    completed_requests: 0,
    failed_requests: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost: 0,
    metadata: batchMetadata,
  });

  if (insertError) {
    console.error('[GeminiBatch] Failed to insert parent batch job:', insertError);
    return { success: false, error: insertError.message };
  }

  // Insert batch_job_items — one per product/UPC
  const items = products.map((product) => ({
    batch_job_id: batchId,
    upc: product.upc,
    status: 'pending' as const,
    request_payload: {
      upc: product.upc,
      model,
      sources: product.sources,
      productLineContext: product.productLineContext,
      imageUrls: product.imageUrls ?? null,
    },
    product_source: product.sources,
  }));

  const { error: itemsError } = await supabase.from('batch_job_items').insert(items);
  if (itemsError) {
    console.error('[GeminiBatch] Failed to insert batch job items:', itemsError);
    await supabase.from('batch_jobs').delete().eq('id', batchId);
    return { success: false, error: itemsError.message };
  }

  // Mark products as merging
  const upcs = products.map((p) => p.upc);
  try {
    await supabase
      .from('products_ingestion')
      .update({ pipeline_status: 'merging', updated_at: new Date().toISOString() })
      .in('upc', upcs);
  } catch (err) {
    console.warn('[GeminiBatch] Failed to mark products as merging:', err);
  }

  console.log('[GeminiBatch] Created batch %s with %d items', batchId, items.length);

  // provider_batch_id is null until submitPreparedGeminiBatch succeeds;
  // using a pre-generated fake ID would confuse lookup/UI semantics.
  return {
    success: true,
    batch_id: batchId,
    provider: 'gemini',
    provider_batch_id: '',
    product_count: products.length,
    execution_mode: 'gemini_batch',
  };
}

// =============================================================================
// Chunked Image Prep (Phase 3, Task 13)
// =============================================================================

/**
 * Prepare up to `limit` pending items in a Gemini batch by:
 * 1. Selecting image URLs from product data (selected_images, image_candidates, sources)
 * 2. Fetching images from URLs (SSRF-safe, size/time limited)
 * 3. Uploading to Gemini File API
 * 4. Building the multimodal request payload
 * 5. Storing intermediate request data
 *
 * When no more pending items exist, returns a signal to submit.
 */
export async function prepareGeminiBatchChunk(
  batchDbId: string,
  options?: { limit?: number; geminiApiKey?: string }
): Promise<{
  prepared: number;
  total_pending: number;
  ready_to_submit: boolean;
  errors: string[];
}> {
  const supabase = await createAdminClient();
  const limit = options?.limit ?? DEFAULT_PREP_LIMIT;
  const errors: string[] = [];

  // Load parent batch to get metadata
  const { data: parent, error: parentError } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchDbId)
    .single();

  if (parentError || !parent) {
    return { prepared: 0, total_pending: 0, ready_to_submit: false, errors: ['Parent batch not found'] };
  }

  const parentMetadata = (parent.metadata as GeminiBatchMetadata) || {};
  const model = parentMetadata.llm_model || 'gemini-3.5-flash';
  const geminiApiKey = options?.geminiApiKey || '';

  if (!geminiApiKey) {
    return { prepared: 0, total_pending: 0, ready_to_submit: false, errors: ['Gemini API key not available'] };
  }

  // Clear upload cache for fresh prep
  clearImageUploadCache();

  // Load pending items
  const { data: pendingItems, error: itemsError } = await supabase
    .from('batch_job_items')
    .select('*')
    .eq('batch_job_id', batchDbId)
    .eq('status', 'pending')
    .limit(limit);

  if (itemsError) {
    return { prepared: 0, total_pending: 0, ready_to_submit: false, errors: [itemsError.message] };
  }

  if (!pendingItems || pendingItems.length === 0) {
    // Check if there are still pending or running items
    const { data: remainingItems } = await supabase
      .from('batch_job_items')
      .select('status')
      .eq('batch_job_id', batchDbId);

    const remainingPending = (remainingItems || []).filter((i) => i.status === 'pending').length;

    // ready_to_submit when no items remain pending.
    // Items in 'running' status have been prepped and are ready for JSONL construction.
    return {
      prepared: 0,
      total_pending: remainingPending,
      ready_to_submit: remainingPending === 0,
      errors: [],
    };
  }

  // Update parent stage
  await supabase
    .from('batch_jobs')
    .update({ status: 'in_progress', metadata: { ...parentMetadata, gemini_stage: 'preparing', image_prep_status: 'in_progress' } })
    .eq('id', batchDbId);

  // Process items
  let preparedCount = 0;
  const imageErrors: string[] = [];

  for (const item of pendingItems) {
    const requestPayload = item.request_payload as Record<string, unknown>;
    const sources = requestPayload.sources as Record<string, unknown> || {};
    const upc = String(requestPayload.upc || item.upc);

    // Extract image URLs from the product's sources and selected_images
    // The sources may have been normalized by buildConsolidationSourcesPayload
    const selectedImages = extractFieldFromSources(sources, 'selected_images');
    const imageCandidates = extractFieldFromSources(sources, 'image_candidates');
    const imageUrls = requestPayload.imageUrls as string[] | undefined;

    // Mark as running (image prep in progress)
    await supabase
      .from('batch_job_items')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', item.id);

    // Prepare images
    const imagePrepResult = await prepareProductImages(
      imageUrls ?? selectedImages,
      imageCandidates,
      sources,
      geminiApiKey
    );

    if (imagePrepResult.errors.length > 0) {
      imageErrors.push(...imagePrepResult.errors.map((e) => `${upc}: ${e}`));
    }

    // Store the request payload with image file URIs
    // Stay in 'running' state — this indicates prepared + ready for JSONL construction
    const enhancedRequestPayload = {
      ...requestPayload,
      _imageParts: imagePrepResult.imageParts,
      _imageErrors: imagePrepResult.errors,
    };

    await supabase
      .from('batch_job_items')
      .update({
        request_payload: enhancedRequestPayload,
        status: 'running',
      })
      .eq('id', item.id);

    preparedCount++;
  }

  // Check total pending
  const { data: allItems } = await supabase
    .from('batch_job_items')
    .select('status')
    .eq('batch_job_id', batchDbId);

  const remainingPending = (allItems || []).filter((i) => i.status === 'pending').length;

  // Update parent metadata with image stats
  // ready_to_submit when no items remain pending (running items are prepped + ready for JSONL)
  const updatedMetadata: GeminiBatchMetadata = {
    ...parentMetadata,
    image_prep_status: remainingPending === 0 ? 'completed' : 'in_progress',
    image_count: (parentMetadata.image_count || 0) + preparedCount * MAX_IMAGES_PER_PRODUCT,
    image_errors: [...(parentMetadata.image_errors || []), ...imageErrors].slice(-100), // keep last 100 errors
  };

  await supabase
    .from('batch_jobs')
    .update({ metadata: updatedMetadata })
    .eq('id', batchDbId);

  errors.push(...imageErrors);

  return {
    prepared: preparedCount,
    total_pending: remainingPending,
    ready_to_submit: remainingPending === 0,
    errors,
  };
}

/**
 * Extract a field from normalized sources or top-level source records.
 */
function extractFieldFromSources(sources: Record<string, unknown>, fieldName: string): unknown {
  // Check each source for the field
  for (const [, sourceData] of Object.entries(sources)) {
    if (sourceData && typeof sourceData === 'object') {
      const data = sourceData as Record<string, unknown>;
      if (fieldName in data) {
        return data[fieldName];
      }
    }
  }
  return undefined;
}

// =============================================================================
// Batch Submission (Phase 3, Task 13 continued)
// =============================================================================

/**
 * Submit a prepared Gemini batch to the provider.
 * 1. Build JSONL from prepared items (with image file URIs)
 * 2. Upload JSONL to Gemini File API
 * 3. Create Gemini batch job
 * 4. Update DB rows with provider IDs
 */
export async function submitPreparedGeminiBatch(
  batchDbId: string,
  geminiApiKey: string
): Promise<{ success: boolean; provider_batch_id?: string; error?: string }> {
  const supabase = await createAdminClient();

  // Load parent
  const { data: parent, error: parentError } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchDbId)
    .single();

  if (parentError || !parent) {
    return { success: false, error: 'Parent batch not found' };
  }

  const parentMetadata = (parent.metadata as GeminiBatchMetadata) || {};
  const model = parentMetadata.llm_model || 'gemini-3.5-flash';

  // Load all running (prepared) items — items that have completed image prep and are ready for JSONL
  const { data: items, error: itemsError } = await supabase
    .from('batch_job_items')
    .select('*')
    .eq('batch_job_id', batchDbId)
    .eq('status', 'running');

  if (itemsError) {
    return { success: false, error: itemsError.message };
  }

  if (!items || items.length === 0) {
    return { success: false, error: 'No items to submit' };
  }

  // Update parent stage
  await supabase
    .from('batch_jobs')
    .update({
      status: 'in_progress',
      metadata: { ...parentMetadata, gemini_stage: 'submitting' },
    })
    .eq('id', batchDbId);

  // Reconstruct ProductSource array from items
  const products: ProductSource[] = items.map((item) => {
    const payload = item.request_payload as Record<string, unknown>;
    return {
      upc: String(payload.upc || item.upc),
      sources: (payload.sources as Record<string, unknown>) || {},
      productLineContext: payload.productLineContext as ProductSource['productLineContext'],
      imageUrls: (payload.imageUrls as string[]) || undefined,
    };
  });

  // Build image parts map
  const imagePartsByUpc = new Map<string, PreparedImagePart[]>();
  for (const item of items) {
    const payload = item.request_payload as Record<string, unknown>;
    const parts = (payload._imageParts as PreparedImagePart[]) || [];
    imagePartsByUpc.set(item.upc, parts);
  }

  // Build categories for prompt
  const { categories = [] } = await buildPromptContext();

  // Try to create context cache for the system instruction
  let cacheName: string | undefined;
  try {
    const client = createGeminiClient(geminiApiKey);
    const systemPrompt = generateSystemPrompt(categories);
    console.log('[GeminiBatch] Creating explicit context cache for model %s...', model);
    // TTL is 24 hours (86400s) to comfortably cover the batch execution window
    const cacheResult = await client.createCache(model, systemPrompt, 86400, `batch-${batchDbId}`);
    cacheName = cacheResult.name;
    console.log('[GeminiBatch] Explicit context cache created:', cacheName);
    
    // Mutate parentMetadata so it is preserved when updating metadata below
    parentMetadata.gemini_cache_name = cacheName;
  } catch (err) {
    console.warn('[GeminiBatch] Context cache creation failed, falling back to inline system instruction:', err);
  }

  // Build JSONL - pass cachedContent if available
  const jsonl = createGeminiBatchJsonl(products, imagePartsByUpc, categories, model, {
    cachedContent: cacheName,
  });

  // Upload JSONL to Gemini File API
  try {
    const uploadResult = await uploadJsonlToGemini(jsonl, geminiApiKey, batchDbId);
    // Update parent with JSONL file info
    // fileResourceName (e.g. "files/abc123") is used for local tracking;
    // fileUri is the full URI needed for createBatch() inputFile.fileUri
    await supabase
      .from('batch_jobs')
      .update({
        provider_input_file_id: uploadResult.fileResourceName,
        metadata: {
          ...parentMetadata,
          gemini_stage: 'submitting',
          uploaded_jsonl_resource_name: uploadResult.fileResourceName,
          uploaded_jsonl_file_name: `batch_${batchDbId}.jsonl`,
        },
      })
      .eq('id', batchDbId);

    // Create Gemini batch job — pass fileUri (full URI), not resource name
    const client = createGeminiClient(geminiApiKey);
    const batchResult = await client.createBatch(uploadResult.fileUri, model, {
      temperature: 0.1,
      maxOutputTokens: 2048,
    });

    if (batchResult.error) {
      await supabase
        .from('batch_jobs')
        .update({
          status: 'failed',
          error_message: `Gemini batch creation failed: ${batchResult.error.message}`,
          metadata: { ...parentMetadata, gemini_stage: 'failed' },
        })
        .eq('id', batchDbId);

      return { success: false, error: batchResult.error.message };
    }

    // Update parent with provider batch info
    await supabase
      .from('batch_jobs')
      .update({
        status: 'in_progress',
        provider_batch_id: batchResult.name,
        metadata: {
          ...parentMetadata,
          gemini_stage: 'in_progress',
          provider_batch_resource_name: batchResult.name,
        },
      })
      .eq('id', batchDbId);

    return { success: true, provider_batch_id: batchResult.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown submission error';
    console.error('[GeminiBatch] Submit failed:', err);

    await supabase
      .from('batch_jobs')
      .update({
        status: 'failed',
        error_message: `Gemini submission failed: ${message}`,
        metadata: { ...parentMetadata, gemini_stage: 'failed' },
      })
      .eq('id', batchDbId);

    return { success: false, error: message };
  }
}

// =============================================================================
// Provider Polling & Result Download (Phase 3, Task 14)
// =============================================================================

/**
 * Sync Gemini batch status from the provider.
 * Polls the batch state and downloads results when complete.
 * Idempotent — safe to call repeatedly.
 */
export async function syncGeminiBatchStatus(
  batchDbId: string,
  geminiApiKey: string
): Promise<{
  status: string;
  is_complete: boolean;
  items_updated: number;
  token_totals?: { prompt: number; completion: number; total: number };
  error?: string;
}> {
  const supabase = await createAdminClient();

  // Load parent
  const { data: parent, error: parentError } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchDbId)
    .single();

  if (parentError || !parent) {
    return { status: 'failed', is_complete: false, items_updated: 0, error: 'Parent batch not found' };
  }

  const parentMetadata = (parent.metadata as GeminiBatchMetadata) || {};
  const providerBatchName = parentMetadata.provider_batch_resource_name || parent.provider_batch_id;

  if (!providerBatchName) {
    return { status: parent.status, is_complete: false, items_updated: 0, error: 'Batch not yet submitted to provider' };
  }

  // If already complete, just download results
  if (['completed', 'failed', 'cancelled', 'expired'].includes(parent.status)) {
    return { status: parent.status, is_complete: true, items_updated: 0 };
  }

  // Poll provider
  try {
    const client = createGeminiClient(geminiApiKey);
    const statusResult = await client.getBatchStatus(providerBatchName);

    // Map provider states
    let mappedStatus: string;
    let geminiStage: GeminiBatchStage;

    switch (statusResult.state) {
      case 'PENDING':
        mappedStatus = 'pending';
        geminiStage = 'in_progress';
        break;
      case 'ACTIVE':
        mappedStatus = 'in_progress';
        geminiStage = 'in_progress';
        break;
      case 'COMPLETED':
        mappedStatus = 'finalizing';
        geminiStage = 'finalizing';
        break;
      case 'FAILED':
        mappedStatus = 'failed';
        geminiStage = 'failed';
        break;
      case 'CANCELLED':
        mappedStatus = 'cancelled';
        geminiStage = 'cancelled';
        break;
      default:
        mappedStatus = 'in_progress';
        geminiStage = 'in_progress';
    }

    // Update parent metadata
    await supabase
      .from('batch_jobs')
      .update({
        status: mappedStatus,
        metadata: {
          ...parentMetadata,
          gemini_stage: geminiStage,
          provider_batch_resource_name: providerBatchName,
          provider_state: statusResult.state,
          provider_completed_count: statusResult.completedCount,
          provider_failed_count: statusResult.failedCount,
          provider_request_count: statusResult.requestCount,
        },
      })
      .eq('id', batchDbId);

    // Download results when complete
    if (statusResult.state === 'COMPLETED' || statusResult.state === 'FAILED') {
      return await downloadAndParseGeminiResults(batchDbId, geminiApiKey, statusResult);
    }

    return {
      status: mappedStatus,
      is_complete: false,
      items_updated: 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    console.error(`[GeminiBatch] Sync failed for ${batchDbId}:`, err);
    return { status: parent.status, is_complete: false, items_updated: 0, error: message };
  }
}

/**
 * Download and parse Gemini batch results.
 */
async function downloadAndParseGeminiResults(
  batchDbId: string,
  geminiApiKey: string,
  statusResult: { outputFile?: { fileUri?: string }; errorFile?: { fileUri?: string } }
): Promise<{
  status: string;
  is_complete: boolean;
  items_updated: number;
  token_totals?: { prompt: number; completion: number; total: number };
  error?: string;
}> {
  const supabase = await createAdminClient();
  const client = createGeminiClient(geminiApiKey);

  // Load parent and items
  const { data: parent } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchDbId)
    .single();

  if (!parent) {
    return { status: 'failed', is_complete: false, items_updated: 0, error: 'Parent batch not found' };
  }

  const parentMetadata = (parent.metadata as GeminiBatchMetadata) || {};
  const { categories = [] } = await buildPromptContext();

  let itemsUpdated = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;

  // Download output file
  if (statusResult.outputFile?.fileUri) {
    try {
      const outputResourceName = extractResourceNameFromUri(statusResult.outputFile.fileUri);
      const outputText = await client.downloadFileText(outputResourceName);

      // Parse JSONL
      const parsedResults = parseGeminiBatchOutput(outputText);

      for (const result of parsedResults) {
        const upc = result.key;

        if (result.error) {
          // Mark item as failed
          await supabase
            .from('batch_job_items')
            .update({
              status: 'failed',
              error_message: result.error,
              response_payload: { gemini_error: result.error },
              completed_at: new Date().toISOString(),
            })
            .eq('batch_job_id', batchDbId)
            .eq('upc', upc);

          itemsUpdated++;
          continue;
        }

        if (result.text) {
          const parsed = parseStructuredConsolidationText(upc, result.text, categories);

          // Accumulate tokens
          if (result.usage) {
            totalPromptTokens += result.usage.promptTokenCount || 0;
            totalCompletionTokens += result.usage.candidatesTokenCount || 0;
            totalTokens += result.usage.totalTokenCount || 0;
          }

          await supabase
            .from('batch_job_items')
            .update({
              status: parsed.error ? 'failed' : 'completed',
              response_payload: { gemini_text: result.text, gemini_usage: result.usage },
              parsed_result: parsed as unknown as Record<string, unknown>,
              error_message: parsed.error || null,
              completed_at: new Date().toISOString(),
            })
            .eq('batch_job_id', batchDbId)
            .eq('upc', upc);

          itemsUpdated++;
        }
      }

      // Save output file resource name
      await supabase
        .from('batch_jobs')
        .update({ provider_output_file_id: outputResourceName })
        .eq('id', batchDbId);
    } catch (err) {
      console.error('[GeminiBatch] Failed to download/parse output:', err);
    }
  }

  // Download error file if available
  if (statusResult.errorFile?.fileUri) {
    try {
      const errorResourceName = extractResourceNameFromUri(statusResult.errorFile.fileUri);
      await supabase
        .from('batch_jobs')
        .update({ provider_error_file_id: errorResourceName })
        .eq('id', batchDbId);
    } catch {
      // Non-fatal
    }
  }

  // Calculate cost
  const model = parentMetadata.llm_model || 'gemini-3.5-flash';
  const estimatedCost = calculateAICost(model, totalPromptTokens, totalCompletionTokens, true);

  // Finalize parent
  const completedItems = (await supabase
    .from('batch_job_items')
    .select('status')
    .eq('batch_job_id', batchDbId))
    .data || [];

  const completedCount = completedItems.filter((i) => i.status === 'completed').length;
  const failedCount = completedItems.filter((i) => i.status === 'failed').length;
  const finalStatus = completedCount > 0 ? 'completed' : 'failed';

  await supabase
    .from('batch_jobs')
    .update({
      status: finalStatus,
      completed_requests: completedCount,
      failed_requests: failedCount,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      completed_at: new Date().toISOString(),
      metadata: {
        ...parentMetadata,
        gemini_stage: finalStatus === 'completed' ? 'completed' : 'failed',
      },
    })
    .eq('id', batchDbId);

  // Cleanup context cache if we created one
  if (parentMetadata.gemini_cache_name && geminiApiKey) {
    try {
      const client = createGeminiClient(geminiApiKey);
      console.log('[GeminiBatch] Deleting explicit context cache %s...', parentMetadata.gemini_cache_name);
      await client.deleteCache(parentMetadata.gemini_cache_name);
      console.log('[GeminiBatch] Explicit context cache deleted successfully');
    } catch (err) {
      console.warn('[GeminiBatch] Failed to delete context cache:', err);
    }
  }

  return {
    status: finalStatus,
    is_complete: true,
    items_updated: itemsUpdated,
    token_totals: {
      prompt: totalPromptTokens,
      completion: totalCompletionTokens,
      total: totalTokens,
    },
  };
}

/**
 * Extract the resource name from a Gemini File URI.
 * URIs look like "files/abc123" or "/v1beta/files/abc123".
 */
function extractResourceNameFromUri(fileUri: string): string {
  // Strip leading slash and version prefix
  const cleaned = fileUri.replace(/^\//, '').replace(/^v1beta\//, '');
  // If it's already a short resource name, return as-is
  if (cleaned.startsWith('files/')) {
    return cleaned;
  }
  // Try to extract the files/... portion
  const match = cleaned.match(/(files\/[^/\s?#]+)/);
  if (match) {
    return match[1];
  }
  return cleaned;
}

// =============================================================================
// Result Retrieval (Phase 3, Task 14 continued)
// =============================================================================

/**
 * Retrieve parsed consolidation results for a completed Gemini batch.
 */
export async function retrieveGeminiBatchResults(
  batchDbId: string
): Promise<ConsolidationResult[] | BatchErrorResponse> {
  const supabase = await createAdminClient();

  const { data: items } = await supabase
    .from('batch_job_items')
    .select('*')
    .eq('batch_job_id', batchDbId);

  if (!items) {
    return { success: false, error: 'No items found' };
  }

  const results: ConsolidationResult[] = [];

  for (const item of items as BatchJobItem[]) {
    if (item.status === 'completed' && item.parsed_result) {
      results.push(item.parsed_result as unknown as ConsolidationResult);
    } else if (item.status === 'failed') {
      results.push({
        upc: item.upc,
        error: item.error_message || 'Gemini consolidation failed',
      });
    }
  }

  return results.length > 0
    ? results
    : { success: false, error: 'No results found' };
}

// =============================================================================
// Cancellation (Phase 3, Task 14 continued)
// =============================================================================

/**
 * Cancel a Gemini batch job at the provider level and in the local DB.
 */
export async function cancelGeminiBatch(
  batchDbId: string,
  geminiApiKey: string
): Promise<{ success: true } | BatchErrorResponse> {
  const supabase = await createAdminClient();

  // Load parent
  const { data: parent } = await supabase
    .from('batch_jobs')
    .select('*')
    .eq('id', batchDbId)
    .single();

  const parentMetadata = (parent?.metadata as GeminiBatchMetadata) || {};
  const providerBatchName = parentMetadata.provider_batch_resource_name || parent?.provider_batch_id;

  // Cancel at provider level if submitted
  if (providerBatchName && geminiApiKey) {
    try {
      const client = createGeminiClient(geminiApiKey);
      const cancelResult = await client.cancelBatch(providerBatchName);
      if (!cancelResult.success) {
        console.warn('[GeminiBatch] Provider cancel warning:', cancelResult.error);
      }
    } catch (err) {
      console.warn('[GeminiBatch] Provider cancel error:', err);
    }
  }

  // Cleanup context cache if we created one
  if (parentMetadata.gemini_cache_name && geminiApiKey) {
    try {
      const client = createGeminiClient(geminiApiKey);
      console.log('[GeminiBatch] Deleting explicit context cache %s during cancellation...', parentMetadata.gemini_cache_name);
      await client.deleteCache(parentMetadata.gemini_cache_name);
      console.log('[GeminiBatch] Explicit context cache deleted successfully during cancellation');
    } catch (err) {
      console.warn('[GeminiBatch] Failed to delete context cache during cancellation:', err);
    }
  }

  // Cancel in local DB
  const { error: parentErr } = await supabase
    .from('batch_jobs')
    .update({
      status: 'cancelled',
      metadata: { ...parentMetadata, gemini_stage: 'cancelled' },
    })
    .eq('id', batchDbId);

  if (parentErr) {
    return { success: false, error: parentErr.message };
  }

  // Cancel non-terminal items
  const { error: itemsErr } = await supabase
    .from('batch_job_items')
    .update({ status: 'cancelled' })
    .eq('batch_job_id', batchDbId)
    .in('status', ['pending', 'running']);

  if (itemsErr) {
    console.warn('[GeminiBatch] Failed to cancel items:', itemsErr.message);
  }

  return { success: true };
}

// =============================================================================
// Status Helpers
// =============================================================================

/**
 * Build a BatchStatus from a Gemini batch_jobs row.
 */
export function buildGeminiBatchStatus(parent: Record<string, unknown>): BatchStatus {
  const totalRequests = Number(parent.total_requests) || 0;
  const completedRequests = Number(parent.completed_requests) || 0;
  const failedRequests = Number(parent.failed_requests) || 0;
  const totalTerminal = completedRequests + failedRequests;
  const statusValue = String(parent.status || 'pending');

  return {
    id: String(parent.id),
    provider: 'gemini' as BatchStatus['provider'],
    provider_batch_id: String(parent.provider_batch_id || ''),
    status: statusValue as BatchStatus['status'],
    is_complete: ['completed', 'failed', 'expired', 'cancelled'].includes(statusValue),
    is_failed: ['failed', 'expired', 'cancelled'].includes(statusValue),
    is_processing: ['validating', 'in_progress', 'pending', 'finalizing'].includes(statusValue),
    total_requests: totalRequests,
    completed_requests: completedRequests,
    failed_requests: failedRequests,
    progress_percent: totalRequests > 0 ? Math.round((totalTerminal / totalRequests) * 100) : 0,
    prompt_tokens: Number(parent.prompt_tokens) || undefined,
    completion_tokens: Number(parent.completion_tokens) || undefined,
    total_tokens: Number(parent.total_tokens) || undefined,
    created_at: parent.created_at ? new Date(String(parent.created_at)).getTime() / 1000 : undefined,
    completed_at: parent.completed_at ? new Date(String(parent.completed_at)).getTime() / 1000 : null,
    metadata: (parent.metadata as BatchMetadata) || {},
  };
}
