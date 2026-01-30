/**
 * Batch Service
 *
 * Core service for OpenAI Batch API operations.
 * Handles batch submission, status checking, and result retrieval.
 * Ported and adapted from BayStateTools.
 */

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient, CONSOLIDATION_CONFIG } from './openai-client';
import { buildPromptContext } from './prompt-builder';
import { buildResponseSchema, validateConsolidationTaxonomy } from './taxonomy-validator';
import { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
import type {
    BatchJob,
    BatchMetadata,
    BatchStatus,
    ConsolidationResult,
    ProductSource,
    SubmitBatchResponse,
    BatchErrorResponse,
    ApplyResultsResponse,
    PipelineStatus,
} from './types';

// =============================================================================
// Batch Content Generation
// =============================================================================

/**
 * Fields relevant for classification - inclusion list.
 */
const RELEVANT_FIELDS = [
    'Name',
    'Brand',
    'Weight',
    'Size',
    'Attributes',
    'Description',
    'Category',
    'ProductType',
    'Flavor',
    'Color',
    'Price',
    'Unit',
    'Quantity',
];

/**
 * Create a JSONL batch file content for product consolidation.
 */
export function createBatchContent(
    products: ProductSource[],
    systemPrompt: string,
    responseFormat?: object
): string {
    const lines: string[] = [];

    for (const product of products) {
        // Filter sources to only include relevant fields
        const filteredSources: Record<string, unknown> = {};

        Object.entries(product.sources).forEach(([scraper, data]: [string, unknown]) => {
            if (data && typeof data === 'object') {
                const sourceData = data as Record<string, unknown>;
                const filteredData: Record<string, unknown> = {};

                // Include explicit relevant fields
                RELEVANT_FIELDS.forEach((field) => {
                    if (sourceData[field]) filteredData[field] = sourceData[field];
                });

                // Scan for other potential useful text fields
                Object.entries(sourceData).forEach(([key, value]) => {
                    if (RELEVANT_FIELDS.includes(key)) return;
                    if (key.toLowerCase().includes('image')) return;
                    if (key.toLowerCase().includes('url')) return;

                    if (typeof value === 'string' && value.length > 2 && !value.startsWith('http')) {
                        filteredData[key] = value;
                        return;
                    }

                    if (typeof value === 'object' && value !== null) {
                        try {
                            const json = JSON.stringify(value);
                            if (json.length > 2 && json.length < 500) {
                                filteredData[key] = json;
                            }
                        } catch {
                            // ignore
                        }
                    }
                });

                if (Object.keys(filteredData).length > 0) {
                    filteredSources[scraper] = filteredData;
                }
            }
        });

        const userPrompt = `Consolidate this product data for SKU: ${product.sku}\n\n${JSON.stringify(filteredSources, null, 2)}`;

        const request = {
            custom_id: product.sku,
            method: 'POST',
            url: '/v1/chat/completions',
            body: {
                model: CONSOLIDATION_CONFIG.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: CONSOLIDATION_CONFIG.maxTokens,
                temperature: CONSOLIDATION_CONFIG.temperature,
                ...(responseFormat ? { response_format: responseFormat } : {}),
            },
        };

        lines.push(JSON.stringify(request));
    }

    return lines.join('\n');
}

// =============================================================================
// Batch Submission
// =============================================================================

/**
 * Submit a batch job to OpenAI and track it in Supabase.
 */
export async function submitBatch(
    products: ProductSource[],
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    const client = getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    try {
        // Build prompt context with taxonomy
        const { systemPrompt, categories, productTypes } = await buildPromptContext();

        // Build JSON schema with enum constraints
        const responseFormat = buildResponseSchema(categories, productTypes);

        // Create JSONL content
        const content = createBatchContent(products, systemPrompt, responseFormat);
        const blob = new Blob([content], { type: 'application/jsonl' });
        const file = new File([blob], 'batch.jsonl', { type: 'application/jsonl' });

        // Upload file to OpenAI
        const fileResponse = await client.files.create({
            file: file,
            purpose: 'batch',
        });

        // Convert metadata to strings (OpenAI requires string values)
        const stringMetadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (value !== undefined) {
                stringMetadata[key] = String(value);
            }
        }

        // Create batch
        const batch = await client.batches.create({
            input_file_id: fileResponse.id,
            endpoint: '/v1/chat/completions',
            completion_window: CONSOLIDATION_CONFIG.completionWindow,
            metadata: stringMetadata,
        });

        // Track batch job in Supabase
        const supabase = await createClient();
        const { error: dbError } = await supabase.from('batch_jobs').insert({
            id: batch.id,
            status: batch.status,
            description: metadata.description || null,
            auto_apply: !!metadata.auto_apply,
            total_requests: products.length,
            input_file_id: fileResponse.id,
            metadata: stringMetadata,
        });

        if (dbError) {
            console.warn('[Consolidation] Failed to track batch in database:', dbError);
        }

        return {
            success: true,
            batch_id: batch.id,
            product_count: products.length,
        };
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to submit batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit batch',
        };
    }
}

// =============================================================================
// Batch Status
// =============================================================================

/**
 * Get the status of a batch job. Also syncs status to Supabase.
 */
export async function getBatchStatus(batchId: string): Promise<BatchStatus | BatchErrorResponse> {
    const client = getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
        const batch = await client.batches.retrieve(batchId);
        const requestCounts = batch.request_counts || { total: 0, completed: 0, failed: 0 };

        const status: BatchStatus = {
            id: batch.id,
            status: batch.status as BatchStatus['status'],
            is_complete: batch.status === 'completed',
            is_failed: ['failed', 'expired', 'cancelled'].includes(batch.status),
            is_processing: ['validating', 'in_progress', 'finalizing'].includes(batch.status),
            total_requests: requestCounts.total || 0,
            completed_requests: requestCounts.completed || 0,
            failed_requests: requestCounts.failed || 0,
            progress_percent:
                requestCounts.total > 0
                    ? ((requestCounts.completed + (requestCounts.failed || 0)) / requestCounts.total) * 100
                    : 0,
            created_at: batch.created_at,
            completed_at: batch.completed_at,
            metadata: (batch.metadata || {}) as BatchMetadata,
        };

        // Sync status to Supabase
        const supabase = await createClient();
        const updateData: Record<string, unknown> = {
            status: batch.status,
            total_requests: requestCounts.total || 0,
            completed_requests: requestCounts.completed || 0,
            failed_requests: requestCounts.failed || 0,
            output_file_id: batch.output_file_id,
            error_file_id: batch.error_file_id,
        };

        if (batch.completed_at) {
            updateData.completed_at = new Date(batch.completed_at * 1000).toISOString();
        }

        await supabase
            .from('batch_jobs')
            .upsert(
                {
                    id: batch.id,
                    ...updateData,
                    input_file_id: batch.input_file_id,
                },
                { onConflict: 'id' }
            );

        return status;
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to get batch status:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get batch status',
        };
    }
}

// =============================================================================
// Result Retrieval
// =============================================================================

/**
 * Retrieve and parse results from a completed batch.
 */
export async function retrieveResults(batchId: string): Promise<ConsolidationResult[] | BatchErrorResponse> {
    const client = getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
        // Fetch taxonomy for validation
        const { categories, productTypes } = await buildPromptContext();

        const batch = await client.batches.retrieve(batchId);

        if (!['completed', 'failed', 'cancelled'].includes(batch.status)) {
            return { success: false, error: `Batch not complete. Status: ${batch.status}` };
        }

        const results: ConsolidationResult[] = [];

        // Process Output File (Successes)
        if (batch.output_file_id) {
            try {
                const fileContent = await client.files.content(batch.output_file_id);
                const text = await fileContent.text();

                for (const line of text.trim().split('\n')) {
                    if (!line) continue;
                    try {
                        const result = JSON.parse(line);
                        const sku = result.custom_id || 'unknown';

                        if (result.error) {
                            results.push({ sku, error: result.error.message || 'Unknown error' });
                            continue;
                        }

                        const response = result.response || {};
                        if (response.status_code !== 200) {
                            results.push({ sku, error: `API error: ${response.status_code}` });
                            continue;
                        }

                        const body = response.body || {};
                        const choices = body.choices || [];
                        if (choices.length === 0) {
                            results.push({ sku, error: 'No choices in response' });
                            continue;
                        }

                        const content = choices[0]?.message?.content || '';
                        const parsed = parseJsonResponse(content);

                        if (parsed) {
                            const normalized = normalizeConsolidationResult(parsed);
                            const validated = validateConsolidationTaxonomy(normalized, categories, productTypes);
                            results.push({ sku, ...validated } as ConsolidationResult);
                        } else {
                            results.push({ sku, error: 'Failed to parse JSON response' });
                        }
                    } catch (e) {
                        console.warn('[Consolidation] Failed to parse result line:', e);
                    }
                }
            } catch (e) {
                console.warn('[Consolidation] Failed to process output file:', e);
            }
        }

        // Process Error File (Failures)
        if (batch.error_file_id) {
            try {
                const fileContent = await client.files.content(batch.error_file_id);
                const text = await fileContent.text();

                for (const line of text.trim().split('\n')) {
                    if (!line) continue;
                    try {
                        const errorRecord = JSON.parse(line);
                        const sku = errorRecord.custom_id || 'unknown';
                        const errMsg = errorRecord.error?.message || JSON.stringify(errorRecord);
                        results.push({ sku, error: `Batch Error: ${errMsg}` });
                    } catch (e) {
                        console.warn('[Consolidation] Failed to parse error line:', e);
                    }
                }
            } catch (e) {
                console.warn('[Consolidation] Failed to process error file:', e);
            }
        }

        if (results.length === 0) {
            return { success: false, error: 'No results found in batch output' };
        }

        return results;
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to retrieve results:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to retrieve results',
        };
    }
}

// =============================================================================
// Apply Results
// =============================================================================

/**
 * Apply consolidation results to the products_ingestion table.
 */
export async function applyResults(batchId: string): Promise<ApplyResultsResponse | BatchErrorResponse> {
    const results = await retrieveResults(batchId);

    if ('success' in results && !results.success) {
        return results;
    }

    if (!Array.isArray(results)) {
        return { success: false, error: 'Invalid results format' };
    }

    const supabase = await createClient();
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const result of results) {
        if (result.error) {
            errorCount++;
            if (errors.length < 10) {
                errors.push(`${result.sku}: ${result.error}`);
            }
            continue;
        }

        try {
            // Build consolidated data object
            const consolidated = {
                name: result.name,
                description: result.description,
                brand_id: result.brand, // Note: This is brand name, not ID - will need brand lookup
                weight: result.weight,
                category: result.category,
                product_type: result.product_type,
                confidence_score: result.confidence_score,
            };

            // Determine pipeline status based on confidence score (Confidence-Based Routing)
            const confidence = result.confidence_score ?? 0;
            let newStatus: PipelineStatus;
            if (confidence >= 0.9) {
                newStatus = 'approved'; // High confidence - auto-approve
            } else if (confidence >= 0.7) {
                newStatus = 'consolidated'; // Medium confidence - manual review
            } else {
                newStatus = 'flagged'; // Low confidence - needs attention
            }

            const { error } = await supabase
                .from('products_ingestion')
                .update({
                    consolidated,
                    pipeline_status: newStatus,
                    updated_at: new Date().toISOString(),
                })
                .eq('sku', result.sku);

            if (error) {
                errorCount++;
                if (errors.length < 10) {
                    errors.push(`${result.sku}: Database error - ${error.message}`);
                }
            } else {
                successCount++;
            }
        } catch (e: unknown) {
            errorCount++;
            if (errors.length < 10) {
                errors.push(`${result.sku}: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
        }
    }

    return {
        status: 'applied',
        success_count: successCount,
        error_count: errorCount,
        total: results.length,
        errors: errors.length > 0 ? errors : undefined,
    };
}

// =============================================================================
// List Batch Jobs
// =============================================================================

/**
 * List batch jobs from the database.
 */
export async function listBatchJobs(limit: number = 20): Promise<BatchJob[] | BatchErrorResponse> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Consolidation] Failed to list batch jobs:', error);
            return { success: false, error: error.message };
        }

        return data as BatchJob[];
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to list batch jobs:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list batch jobs',
        };
    }
}

/**
 * Cancel a batch job.
 */
export async function cancelBatch(batchId: string): Promise<{ status: string } | BatchErrorResponse> {
    const client = getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
        await client.batches.cancel(batchId);

        const supabase = await createClient();
        await supabase.from('batch_jobs').update({ status: 'cancelled' }).eq('id', batchId);

        return { status: 'cancelled' };
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to cancel batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel batch',
        };
    }
}
