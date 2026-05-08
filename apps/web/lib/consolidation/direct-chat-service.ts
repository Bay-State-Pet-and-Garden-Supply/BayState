/**
 * Direct Chat Service
 *
 * Handles DeepSeek, LM Studio, or any OpenAI-compatible consolidation via individual
 * /v1/chat/completions requests instead of the Batch API.
 *
 * Architecture:
 *   submitBatch() → createDirectChatBatch() → inserts batch_jobs + batch_job_items
 *   getBatchStatus() → processDirectChatChunk() → processes N items → aggregateDirectChatStatus()
 *   retrieveResults() → retrieveDirectChatResults() → returns parsed results
 *   cancelBatch() → cancelDirectChatBatch()
 */

import { createAdminClient } from '@/lib/supabase/server';
import { getConsolidationConfig, type ConsolidationRuntimeConfig } from './openai-client';
import { buildPromptContext, buildUserPrompt } from './prompt-builder';
import { buildOpenAIResponseFormat, buildResponseSchema } from './taxonomy-validator';
import { parseStructuredConsolidationText } from './result-parsing';
import { normalizeProductSources } from '@/lib/product-sources';
import type {
    BatchStatus,
    ConsolidationResult,
    ProductSource,
    BatchJobItem,
    SubmitBatchResponse,
    BatchErrorResponse,
} from './types';
import crypto from 'crypto';

// =============================================================================
// Preflight
// =============================================================================

/**
 * Preflight check — calls GET /v1/models to verify the configured LLM endpoint is reachable.
 */
export async function preflightModels(
    runtimeConfig: ConsolidationRuntimeConfig
): Promise<{ success: true; models: Array<{ id: string }> } | { success: false; error: string }> {
    const baseUrl = runtimeConfig.llm_base_url?.replace(/\/+$/, '');
    if (!baseUrl) {
        return { success: false, error: 'LLM base URL is not configured' };
    }

    const apiKey = runtimeConfig.llm_api_key || '';
    const url = `${baseUrl}/models`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': apiKey ? `Bearer ${apiKey}` : '',
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { success: false, error: `LLM preflight failed (${response.status}): ${text.slice(0, 200)}` };
        }

        const data = await response.json() as { data?: Array<{ id: string }> } | Array<{ id: string }>;
        // LM Studio returns { data: [...] } or plain [...]
        const models = Array.isArray(data) ? data : (data.data || []);
        return { success: true, models };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown preflight error';
        return { success: false, error: `LLM endpoint unreachable: ${message}` };
    }
}

// =============================================================================
// Synthetic Batch Creation
// =============================================================================

/**
 * Create a synthetic direct-chat batch job in the database.
 * Inserts one batch_jobs row + one batch_job_items row per product.
 */
export async function createDirectChatBatch(
    products: ProductSource[],
    metadata: Record<string, unknown>,
    runtimeConfig: ConsolidationRuntimeConfig,
    content: string,
    systemPrompt: string,
    responseSchema: object
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    const supabase = await createAdminClient();
    const batchId = crypto.randomUUID();
    const providerBatchId = `direct_${crypto.randomUUID()}`;
    const model = runtimeConfig.model;

    // Parse the JSONL content into individual request payloads
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length !== products.length) {
        console.warn('[DirectChat] JSONL lines mismatch: got %d lines, expected %d products', lines.length, products.length);
    }

    // Build the response format used for these requests
    const openAIResponseFormat = responseSchema ? buildOpenAIResponseFormat(responseSchema) : undefined;

    // Insert batch_jobs parent row
    const { error: insertError } = await supabase.from('batch_jobs').insert({
        id: batchId,
        provider: runtimeConfig.llm_provider,
        provider_batch_id: providerBatchId,
        provider_input_file_id: null,
        provider_output_file_id: null,
        provider_error_file_id: null,
        openai_batch_id: null,
        status: 'pending',
        execution_mode: 'direct_chat_chunks',
        description: (metadata.description as string) || `Direct chat consolidation for ${products.length} products`,
        auto_apply: !!metadata.auto_apply,
        total_requests: products.length,
        completed_requests: 0,
        failed_requests: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost: 0,
        metadata: {
            ...metadata,
            batch_content_jsonl: content,
            llm_model: model,
            llm_base_url: runtimeConfig.llm_base_url,
            system_prompt: systemPrompt,
        },
    });

    if (insertError) {
        console.error('[DirectChat] Failed to insert parent batch job:', insertError);
        return { success: false, error: insertError.message };
    }

    // Insert batch_job_items — one per product/SKU
    const items = products.map((product, idx) => {
        const requestLine = lines[idx] || lines[0]; // fallback to first if index out of range
        let requestPayload: Record<string, unknown>;

        try {
            const parsed = JSON.parse(requestLine);
            requestPayload = parsed.body || parsed;
        } catch {
            // If we can't parse the JSONL line, build from scratch
            const userPrompt = buildUserPrompt(product, []);

            requestPayload = {
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: runtimeConfig.maxTokens,
                temperature: runtimeConfig.temperature,
                ...(openAIResponseFormat ? { response_format: openAIResponseFormat } : {}),
            };
        }

        // Ensure the model matches our runtime config
        if (typeof requestPayload.model === 'string' && requestPayload.model !== model) {
            requestPayload.model = model;
        }

        return {
            batch_id: batchId,
            sku: product.sku,
            status: 'pending',
            request_payload: requestPayload,
            product_source: product.sources,
        };
    });

    // Batch insert items
    const { error: itemsError } = await supabase.from('batch_job_items').insert(items);
    if (itemsError) {
        console.error('[DirectChat] Failed to insert batch job items:', itemsError);
        // Clean up the parent row
        await supabase.from('batch_jobs').delete().eq('id', batchId);
        return { success: false, error: itemsError.message };
    }

    // Mark products as consolidating
    const skus = products.map((p) => p.sku);
    try {
        await supabase
            .from('products_ingestion')
            .update({ pipeline_status: 'consolidating', updated_at: new Date().toISOString() })
            .in('sku', skus);
    } catch (err) {
        console.warn('[DirectChat] Failed to mark products as consolidating:', err);
    }

    console.log('[DirectChat] Created synthetic batch %s with %d items', batchId, items.length);

    return {
        success: true,
        batch_id: batchId,
        provider: runtimeConfig.llm_provider,
        provider_batch_id: providerBatchId,
        product_count: products.length,
    };
}

// =============================================================================
// Chunk Processing
// =============================================================================

/**
 * Process up to `limit` pending items for a direct-chat batch.
 * Claims items atomically (pending → running), calls LLM, stores results.
 */
export async function processDirectChatChunk(
    batchDbId: string,
    options?: { limit?: number; timeoutMs?: number }
): Promise<{ processed: number; completed: number; failed: number }> {
    const supabase = await createAdminClient();
    const limit = options?.limit ?? 1;
    const timeoutMs = options?.timeoutMs ?? 35_000;

    // Load the parent batch to get runtime config
    const { data: parentRow, error: parentError } = await supabase
        .from('batch_jobs')
        .select('id, provider, metadata, provider_batch_id')
        .eq('id', batchDbId)
        .single();

    if (parentError || !parentRow) {
        console.error('[DirectChat] Parent batch not found:', parentError);
        return { processed: 0, completed: 0, failed: 0 };
    }

    const parentMetadata = (parentRow.metadata as Record<string, unknown>) || {};
    const provider = (parentRow.provider as ConsolidationRuntimeConfig['llm_provider'] | null) ?? null;
    const runtimeConfig = await getConsolidationConfig(
        provider ? { forceProvider: provider } : undefined,
    );
    const llmBaseUrl = runtimeConfig.llm_base_url || String(parentMetadata.llm_base_url || '');
    const llmModel = String(parentMetadata.llm_model || runtimeConfig.model || '');

    // Claim pending items atomically using a subquery
    const { data: claimedItems, error: claimError } = await supabase
        .from('batch_job_items')
        .update({
            status: 'running',
            started_at: new Date().toISOString(),
            attempt_count: supabase.rpc('increment', { x: 1 }) as unknown as number, // bypass type — handled via raw
        })
        .eq('batch_id', batchDbId)
        .eq('status', 'pending')
        .limit(limit)
        .select();

    // Fallback: if the RPC-style increment failed, do a simpler claim
    let items: BatchJobItem[] = [];
    if (claimError || !claimedItems || claimedItems.length === 0) {
        // Try simpler approach — read pending, update one at a time
        const { data: pending } = await supabase
            .from('batch_job_items')
            .select('*')
            .eq('batch_id', batchDbId)
            .eq('status', 'pending')
            .limit(limit);

        if (!pending || pending.length === 0) {
            return { processed: 0, completed: 0, failed: 0 };
        }

        for (const item of pending) {
            const { error: claimErr } = await supabase
                .from('batch_job_items')
                .update({
                    status: 'running',
                    started_at: new Date().toISOString(),
                    attempt_count: (item.attempt_count || 0) + 1,
                })
                .eq('id', item.id)
                .eq('status', 'pending'); // atomic: only if still pending

            if (!claimErr) {
                items.push(item as BatchJobItem);
            }
        }
    } else {
        items = claimedItems as unknown as BatchJobItem[];
    }

    if (items.length === 0) {
        return { processed: 0, completed: 0, failed: 0 };
    }

    // Get shopsite pages and categories for parsing
    const { shopsitePages = [], categories = [] } = await buildPromptContext();
    const apiKey = runtimeConfig.llm_api_key || '';

    // Build an OpenAI-compatible client for the configured endpoint
    const client = new (await import('openai')).default({
        apiKey: apiKey || 'lm-studio',
        baseURL: llmBaseUrl || undefined,
        timeout: timeoutMs,
        maxRetries: 1,
    });

    let completed = 0;
    let failed = 0;

    for (const item of items) {
        const requestPayload = item.request_payload as Record<string, unknown>;
        const responsePayload: Record<string, unknown> = {};

        try {
            const chatParams: Record<string, unknown> = {
                model: (requestPayload.model as string) || llmModel,
                messages: requestPayload.messages,
                max_tokens: (requestPayload.max_tokens as number) || 1024,
                temperature: (requestPayload.temperature as number) || 0.1,
            };
            if (requestPayload.response_format) {
                chatParams.response_format = requestPayload.response_format;
            }
            const response = await client.chat.completions.create(chatParams as never);

            const choice = response.choices?.[0];
            const content = choice?.message?.content || '';
            const usage = response.usage;

            responsePayload.raw_response = content;
            responsePayload.model = response.model;
            responsePayload.usage = usage;

            // Parse the response
            const parsed = parseStructuredConsolidationText(item.sku, content, shopsitePages, categories);

            const promptTokens = usage?.prompt_tokens || 0;
            const completionTokens = usage?.completion_tokens || 0;

            // Update item as completed
            await supabase
                .from('batch_job_items')
                .update({
                    status: 'completed',
                    response_payload: responsePayload as Record<string, unknown>,
                    parsed_result: parsed as unknown as Record<string, unknown>,
                    error_message: null,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', item.id);

            completed++;
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error during direct chat completion';

            responsePayload.error = errorMessage;

            await supabase
                .from('batch_job_items')
                .update({
                    status: 'failed',
                    response_payload: responsePayload as Record<string, unknown>,
                    error_message: errorMessage,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', item.id);

            failed++;
        }
    }

    return { processed: items.length, completed, failed };
}

// =============================================================================
// Status Aggregation
// =============================================================================

/**
 * Aggregate item-level statuses into a batch-level BatchStatus.
 */
export async function aggregateDirectChatStatus(
    batchDbId: string
): Promise<BatchStatus | BatchErrorResponse> {
    const supabase = await createAdminClient();

    // Load parent
    const { data: parent, error: parentError } = await supabase
        .from('batch_jobs')
        .select('*')
        .eq('id', batchDbId)
        .single();

    if (parentError || !parent) {
        return { success: false, error: parentError?.message || 'Parent batch not found' };
    }

    // Load all items
    const { data: items, error: itemsError } = await supabase
        .from('batch_job_items')
        .select('*')
        .eq('batch_id', batchDbId);

    if (itemsError) {
        return { success: false, error: itemsError.message };
    }

    const totalRequests = parent.total_requests || items?.length || 0;
    const completedCount = (items || []).filter((i: BatchJobItem) => i.status === 'completed').length;
    const failedCount = (items || []).filter((i: BatchJobItem) => i.status === 'failed').length;
    const runningCount = (items || []).filter((i: BatchJobItem) => i.status === 'running').length;
    const pendingCount = (items || []).filter((i: BatchJobItem) => i.status === 'pending').length;
    const cancelledCount = (items || []).filter((i: BatchJobItem) => i.status === 'cancelled').length;

    const totalTerminal = completedCount + failedCount + cancelledCount;
    const progressPercent = totalRequests > 0 ? Math.round((totalTerminal / totalRequests) * 100) : 0;

    // Determine aggregate status
    let aggregateStatus: string;
    if (pendingCount > 0 || runningCount > 0) {
        aggregateStatus = 'in_progress';
    } else if (failedCount > 0 && completedCount === 0 && cancelledCount === 0) {
        aggregateStatus = 'failed';
    } else if (totalTerminal >= totalRequests) {
        aggregateStatus = 'completed';
    } else {
        aggregateStatus = parent.status || 'pending';
    }

    // Aggregate tokens
    const promptTokens = (items || []).reduce(
        (sum: number, i: BatchJobItem) => sum + (((i.response_payload as Record<string, unknown>)?.usage as Record<string, unknown>)?.prompt_tokens as number || 0),
        0
    );
    const completionTokens = (items || []).reduce(
        (sum: number, i: BatchJobItem) => sum + (((i.response_payload as Record<string, unknown>)?.usage as Record<string, unknown>)?.completion_tokens as number || 0),
        0
    );

    const isComplete = aggregateStatus === 'completed';
    const isFailed = aggregateStatus === 'failed';
    const isProcessing = aggregateStatus === 'in_progress' || aggregateStatus === 'pending';

    const parentMetadata = (parent.metadata as Record<string, unknown>) || {};
    const parentCreatedAt = parent.created_at ? new Date(parent.created_at).getTime() / 1000 : undefined;

    // Build BatchStatus
    const status: BatchStatus = {
        id: String(parent.id),
        provider: (parent.provider || 'deepseek') as BatchStatus['provider'],
        provider_batch_id: parent.provider_batch_id,
        status: aggregateStatus as BatchStatus['status'],
        is_complete: isComplete,
        is_failed: isFailed,
        is_processing: isProcessing,
        total_requests: totalRequests,
        completed_requests: completedCount,
        failed_requests: failedCount,
        progress_percent: progressPercent,
        prompt_tokens: promptTokens || undefined,
        completion_tokens: completionTokens || undefined,
        total_tokens: (promptTokens + completionTokens) || undefined,
        created_at: parentCreatedAt,
        completed_at: aggregateStatus === 'completed' ? Date.now() / 1000 : null,
        metadata: parentMetadata as BatchStatus['metadata'],
    };

    // Sync counts to parent row if changed
    const updateData: Record<string, unknown> = {
        status: aggregateStatus,
        completed_requests: completedCount,
        failed_requests: failedCount,
        total_tokens: promptTokens + completionTokens,
    };
    if (aggregateStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
    }

    await supabase.from('batch_jobs').update(updateData).eq('id', batchDbId);

    return status;
}

// =============================================================================
// Result Retrieval
// =============================================================================

/**
 * Retrieve parsed consolidation results for completed direct-chat items.
 */
export async function retrieveDirectChatResults(
    batchDbId: string
): Promise<ConsolidationResult[]> {
    const supabase = await createAdminClient();

    const { data: items } = await supabase
        .from('batch_job_items')
        .select('*')
        .eq('batch_id', batchDbId);

    if (!items) return [];

    const results: ConsolidationResult[] = [];

    for (const item of items as BatchJobItem[]) {
        if (item.status === 'completed' && item.parsed_result) {
            results.push(item.parsed_result as unknown as ConsolidationResult);
        } else if (item.status === 'failed') {
            results.push({
                sku: item.sku,
                error: item.error_message || 'Unknown error',
            });
        }
    }

    return results;
}

// =============================================================================
// Cancellation
// =============================================================================

/**
 * Cancel a direct-chat batch and all non-terminal items.
 */
export async function cancelDirectChatBatch(
    batchDbId: string
): Promise<{ success: true } | BatchErrorResponse> {
    const supabase = await createAdminClient();

    // Cancel parent
    const { error: parentErr } = await supabase
        .from('batch_jobs')
        .update({ status: 'cancelled' })
        .eq('id', batchDbId);

    if (parentErr) {
        return { success: false, error: parentErr.message };
    }

    // Cancel non-terminal items
    const { error: itemsErr } = await supabase
        .from('batch_job_items')
        .update({ status: 'cancelled' })
        .eq('batch_id', batchDbId)
        .in('status', ['pending', 'running']);

    if (itemsErr) {
        console.warn('[DirectChat] Failed to cancel items:', itemsErr.message);
    }

    return { success: true };
}

// =============================================================================
// Fallback helpers
// =============================================================================

/**
 * Get SKUs of failed items that haven't already been sent to a fallback batch.
 */
export async function getFailedSkusForFallback(
    batchDbId: string
): Promise<Array<{ sku: string; product_source: Record<string, unknown> }>> {
    const supabase = await createAdminClient();

    const { data: items } = await supabase
        .from('batch_job_items')
        .select('sku, product_source')
        .eq('batch_id', batchDbId)
        .eq('status', 'failed')
        .is('fallback_batch_id', null);

    if (!items) return [];

    return items.map((item: { sku: string; product_source: unknown }) => ({
        sku: item.sku,
        product_source: (item.product_source as Record<string, unknown>) || {},
    }));
}

/**
 * Mark items as having a fallback batch assigned.
 */
export async function markItemsWithFallback(
    batchDbId: string,
    skus: string[],
    fallbackBatchId: string
): Promise<void> {
    if (skus.length === 0) return;

    const supabase = await createAdminClient();
    await supabase
        .from('batch_job_items')
        .update({ fallback_batch_id: fallbackBatchId })
        .eq('batch_id', batchDbId)
        .in('sku', skus)
        .eq('status', 'failed');
}
