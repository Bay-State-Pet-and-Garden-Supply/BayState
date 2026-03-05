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
import { buildResponseSchema, validateCategory, validateConsolidationTaxonomy, validateProductType } from './taxonomy-validator';
import { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
import { normalizeProductSources } from '@/lib/product-sources';
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

function hasRelevantKeyName(key: string): boolean {
    const normalized = key.toLowerCase();
    const relevantFragments = [
        'name',
        'brand',
        'weight',
        'size',
        'attribute',
        'description',
        'category',
        'type',
        'flavor',
        'colour',
        'color',
        'price',
        'unit',
        'quantity',
        'material',
        'ingredient',
        'dimension',
        'spec',
        'title',
        'confidence',
        'categories',
        'product_type',
    ];
    return relevantFragments.some((fragment) => normalized.includes(fragment));
}

function isExcludedKeyName(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
        normalized.includes('image') ||
        normalized.includes('url') ||
        normalized === 'scraped_at' ||
        normalized === '_scraped_at' ||
        normalized.startsWith('_')
    );
}

function filterSourceData(sourceData: Record<string, unknown>): Record<string, unknown> {
    const filteredData: Record<string, unknown> = {};

    RELEVANT_FIELDS.forEach((field) => {
        if (field in sourceData && sourceData[field] !== null && sourceData[field] !== undefined) {
            filteredData[field] = sourceData[field];
        }
    });

    Object.entries(sourceData).forEach(([key, value]) => {
        if (key in filteredData || isExcludedKeyName(key)) return;

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 1 && !trimmed.startsWith('http')) {
                filteredData[key] = trimmed;
            }
            return;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            if (hasRelevantKeyName(key)) {
                filteredData[key] = value;
            }
            return;
        }

        if (Array.isArray(value)) {
            const primitiveValues = value.filter(
                (entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
            );
            if (primitiveValues.length > 0 && hasRelevantKeyName(key)) {
                filteredData[key] = primitiveValues.slice(0, 20);
            }
            return;
        }

        if (typeof value === 'object' && value !== null) {
            try {
                const json = JSON.stringify(value);
                if (json.length > 2 && json.length < 1000 && hasRelevantKeyName(key)) {
                    filteredData[key] = value;
                }
            } catch (serializationError: unknown) {
                const fallback = Object.prototype.toString.call(serializationError);
                if (fallback && hasRelevantKeyName(key)) {
                    filteredData[key] = fallback;
                }
            }
        }
    });

    return filteredData;
}

function normalizeLookupKey(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

interface BatchRowLookup {
    id: string;
    metadata: Record<string, unknown> | null;
}

async function findBatchJobRow(
    batchIdentifier: string
): Promise<{ row: BatchRowLookup | null; lookupError: string | null }> {
    const supabase = await createClient();

    const byOpenAi = await supabase
        .from('batch_jobs')
        .select('id, metadata')
        .eq('openai_batch_id', batchIdentifier)
        .limit(1)
        .maybeSingle();

    if (!byOpenAi || typeof byOpenAi !== 'object') {
        return { row: null, lookupError: null };
    }

    if (!byOpenAi.error && byOpenAi.data) {
        return { row: byOpenAi.data as BatchRowLookup, lookupError: null };
    }

    if (isUuid(batchIdentifier)) {
        const byLegacyId = await supabase
            .from('batch_jobs')
            .select('id, metadata')
            .eq('id', batchIdentifier)
            .limit(1)
            .maybeSingle();

        if (!byLegacyId || typeof byLegacyId !== 'object') {
            return { row: null, lookupError: null };
        }

        if (byLegacyId.error) {
            return { row: null, lookupError: byLegacyId.error.message };
        }

        return { row: (byLegacyId.data as BatchRowLookup | null) || null, lookupError: null };
    }

    if (byOpenAi.error && !isUuid(batchIdentifier)) {
        return { row: null, lookupError: byOpenAi.error.message };
    }

    return { row: null, lookupError: null };
}

async function resolveOpenAIBatchId(batchIdentifier: string): Promise<string> {
    if (!isUuid(batchIdentifier)) {
        return batchIdentifier;
    }

    const supabase = await createClient();
    const response = await supabase
        .from('batch_jobs')
        .select('openai_batch_id')
        .eq('id', batchIdentifier)
        .limit(1)
        .maybeSingle();

    if (!response || typeof response !== 'object') {
        return batchIdentifier;
    }

    if (!response.error && response.data && typeof response.data.openai_batch_id === 'string') {
        return response.data.openai_batch_id;
    }

    return batchIdentifier;
}

function parseBatchMetadata(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function toInteger(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return 0;
}

function parseDelimitedTaxonomy(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split('|')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

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

        const normalizedSources = normalizeProductSources(product.sources);

        Object.entries(normalizedSources).forEach(([scraper, data]: [string, unknown]) => {
            if (data && typeof data === 'object') {
                const sourceData = data as Record<string, unknown>;
                const filteredData = filterSourceData(sourceData);

                if (Object.keys(filteredData).length > 0) {
                    filteredSources[scraper] = filteredData;
                }
            }
        });

        const userPrompt = `Consolidate this product data into a review-ready canonical record.\n\n${JSON.stringify(
            {
                sku: product.sku,
                sources: filteredSources,
            },
            null,
            2
        )}`;

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
            openai_batch_id: batch.id,
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
        const resolvedBatchId = await resolveOpenAIBatchId(batchId);
        const batch = await client.batches.retrieve(resolvedBatchId);
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
                    openai_batch_id: batch.id,
                    ...updateData,
                    input_file_id: batch.input_file_id,
                },
                { onConflict: 'openai_batch_id' }
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

        const resolvedBatchId = await resolveOpenAIBatchId(batchId);
        const batch = await client.batches.retrieve(resolvedBatchId);

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

                            const categoryValues = parseDelimitedTaxonomy(
                                typeof validated.category === 'string' ? validated.category : undefined
                            );
                            const productTypeValues = parseDelimitedTaxonomy(
                                typeof validated.product_type === 'string' ? validated.product_type : undefined
                            );

                            const normalizedCategory = categoryValues
                                .map((value) => validateCategory(value, categories))
                                .filter((value, index, array) => array.indexOf(value) === index);
                            const normalizedProductType = productTypeValues
                                .map((value) => validateProductType(value, productTypes))
                                .filter((value, index, array) => array.indexOf(value) === index);

                            if (normalizedCategory.length === 0 || normalizedProductType.length === 0) {
                                results.push({
                                    sku,
                                    error: 'Invalid taxonomy values returned by consolidation model',
                                });
                                continue;
                            }

                            results.push({
                                sku,
                                ...validated,
                                category: normalizedCategory.join('|'),
                                product_type: normalizedProductType.join('|'),
                            } as ConsolidationResult);
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
    return applyConsolidationResults(results, batchId);
}

export async function applyConsolidationResults(
    resultsInput: ConsolidationResult[] | BatchErrorResponse,
    batchIdentifier?: string
): Promise<ApplyResultsResponse | BatchErrorResponse> {
    const results = resultsInput;

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
    let matchedBrandCount = 0;
    let unresolvedBrandCount = 0;
    let preservedExistingFieldCount = 0;
    let overwrittenFieldCount = 0;

    let batchJobRow: BatchRowLookup | null = null;
    if (batchIdentifier) {
        const lookup = await findBatchJobRow(batchIdentifier);
        if (lookup.lookupError) {
            return { success: false, error: `Failed to load batch metadata: ${lookup.lookupError}` };
        }
        batchJobRow = lookup.row;
    }

    const successfulResults = results.filter((result) => !result.error);
    const resultSkus = successfulResults.map((result) => result.sku);

    let existingRows: Array<{ sku: string; consolidated: unknown }> = [];
    if (resultSkus.length > 0) {
        const existingRowsResponse = await supabase
            .from('products_ingestion')
            .select('sku, consolidated')
            .in('sku', resultSkus);

        if (existingRowsResponse.error) {
            return { success: false, error: `Failed to load existing products: ${existingRowsResponse.error.message}` };
        }

        existingRows = (existingRowsResponse.data || []) as Array<{ sku: string; consolidated: unknown }>;
    }

    const existingBySku = new Map<string, Record<string, unknown>>();
    for (const row of existingRows) {
        const consolidated = row.consolidated;
        if (consolidated && typeof consolidated === 'object' && !Array.isArray(consolidated)) {
            existingBySku.set(row.sku, consolidated as Record<string, unknown>);
        } else {
            existingBySku.set(row.sku, {});
        }
    }

    const { data: brands, error: brandsError } = await supabase.from('brands').select('id, name');
    if (brandsError) {
        return { success: false, error: `Failed to load brands: ${brandsError.message}` };
    }

    const brandIdByName = new Map<string, string>();
    for (const brand of brands || []) {
        if (typeof brand.name === 'string' && typeof brand.id === 'string') {
            brandIdByName.set(normalizeLookupKey(brand.name), brand.id);
        }
    }

    for (const result of results) {
        if (result.error) {
            errorCount++;
            if (errors.length < 10) {
                errors.push(`${result.sku}: ${result.error}`);
            }
            continue;
        }

        try {
            const existingConsolidated = existingBySku.get(result.sku) || {};
            const resolvedBrandId = result.brand ? brandIdByName.get(normalizeLookupKey(result.brand)) : undefined;

            if (result.brand) {
                if (resolvedBrandId) {
                    matchedBrandCount += 1;
                } else {
                    unresolvedBrandCount += 1;
                }
            }

            const nextCategory = parseDelimitedTaxonomy(result.category);
            const nextProductType = parseDelimitedTaxonomy(result.product_type);

            const nextFields: Record<string, unknown> = {
                ...(result.name ? { name: result.name } : {}),
                ...(result.description ? { description: result.description } : {}),
                ...(result.weight ? { weight: result.weight } : {}),
                ...(result.brand ? { brand: result.brand } : {}),
                ...(resolvedBrandId ? { brand_id: resolvedBrandId } : {}),
                ...(nextCategory.length > 0 ? { category: nextCategory.join('|') } : {}),
                ...(nextProductType.length > 0 ? { product_type: nextProductType.join('|') } : {}),
                ...(typeof result.confidence_score === 'number'
                    ? { confidence_score: result.confidence_score }
                    : {}),
            };

            Object.entries(nextFields).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                const existingValue = existingConsolidated[key];
                if (existingValue === undefined || existingValue === null || existingValue === '') {
                    overwrittenFieldCount += 1;
                    return;
                }
                if (existingValue === value) {
                    preservedExistingFieldCount += 1;
                } else {
                    overwrittenFieldCount += 1;
                }
            });

            const consolidated = {
                ...existingConsolidated,
                ...nextFields,
            };

            const newStatus: PipelineStatus = 'consolidated';

            const { error } = await supabase
                .from('products_ingestion')
                .update({
                    consolidated,
                    pipeline_status: newStatus,
                    confidence_score: result.confidence_score ?? null,
                    error_message: null,
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

    if (batchJobRow) {
        const priorMetadata = parseBatchMetadata(batchJobRow.metadata);
        const qualityMetrics = {
            matched_brand_count: matchedBrandCount,
            unresolved_brand_count: unresolvedBrandCount,
            preserved_existing_field_count: preservedExistingFieldCount,
            overwritten_field_count: overwrittenFieldCount,
        };

        const metadata = {
            ...priorMetadata,
            quality_metrics: qualityMetrics,
            applied_at: new Date().toISOString(),
            apply_summary: {
                success_count: successCount,
                error_count: errorCount,
                total: results.length,
            },
        };

        const { error: metadataUpdateError } = await supabase
            .from('batch_jobs')
            .update({ metadata })
            .eq('id', batchJobRow.id);

        if (metadataUpdateError) {
            errors.push(`batch metadata update failed: ${metadataUpdateError.message}`);
        }
    }

    const qualityMetrics = {
        matched_brand_count: matchedBrandCount,
        unresolved_brand_count: unresolvedBrandCount,
        preserved_existing_field_count: preservedExistingFieldCount,
        overwritten_field_count: overwrittenFieldCount,
    };

    return {
        status: 'applied',
        success_count: successCount,
        error_count: errorCount,
        total: results.length,
        quality_metrics: qualityMetrics,
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

        const mapped: BatchJob[] = (data || []).map((row) => {
            const rowData = row as Record<string, unknown>;
            const openaiBatchId =
                typeof rowData.openai_batch_id === 'string' && rowData.openai_batch_id.length > 0
                    ? rowData.openai_batch_id
                    : null;
            const metadata = parseBatchMetadata(rowData.metadata);
            const applySummary = parseBatchMetadata(metadata.apply_summary);
            const totalRequests =
                toInteger(rowData.total_requests) || toInteger(applySummary.total) || 0;
            const completedRequests =
                toInteger(rowData.completed_requests) || toInteger(applySummary.success_count) || 0;
            const failedRequests =
                toInteger(rowData.failed_requests) || toInteger(applySummary.error_count) || 0;
            const promptTokens = toInteger(rowData.prompt_tokens);
            const completionTokens = toInteger(rowData.completion_tokens);
            const totalTokens =
                toInteger(rowData.total_tokens) || Math.max(0, promptTokens + completionTokens);

            const estimatedCost =
                typeof rowData.estimated_cost === 'number'
                    ? rowData.estimated_cost
                    : typeof rowData.estimated_cost === 'string'
                        ? Number.parseFloat(rowData.estimated_cost)
                        : 0;

            return {
                ...(rowData as unknown as BatchJob),
                db_id: String(rowData.id),
                openai_batch_id:
                    typeof rowData.openai_batch_id === 'string' ? rowData.openai_batch_id : null,
                id: openaiBatchId || String(rowData.id),
                total_requests: totalRequests,
                completed_requests: completedRequests,
                failed_requests: failedRequests,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                estimated_cost: Number.isFinite(estimatedCost) ? estimatedCost : 0,
            };
        });

        return mapped;
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
        const resolvedBatchId = await resolveOpenAIBatchId(batchId);
        await client.batches.cancel(resolvedBatchId);

        const supabase = await createClient();
        const { row } = await findBatchJobRow(batchId);
        let error = null;
        if (row) {
            const updateResponse = await supabase
                .from('batch_jobs')
                .update({ status: 'cancelled' })
                .eq('id', row.id);
            error = updateResponse.error;
        }

        if (error) {
            console.warn('[Consolidation] Failed to update batch job cancel status:', error.message);
        }

        return { status: 'cancelled' };
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to cancel batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel batch',
        };
    }
}
