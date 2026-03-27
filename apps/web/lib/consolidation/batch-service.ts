/**
 * Batch Service
 *
 * Core service for OpenAI Batch API operations.
 * Handles batch submission, status checking, and result retrieval.
 * Ported and adapted from BayStateTools.
 */

import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient, CONSOLIDATION_CONFIG, getConsolidationConfig } from './openai-client';
import { buildPromptContext } from './prompt-builder';
import {
    buildResponseSchema,
    validateCategory,
    validateConsolidationTaxonomy,
    validateProductType,
    validateRequiredConsolidationFields,
} from './taxonomy-validator';
import { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
import { extractImageCandidatesFromSources, normalizeProductSources, normalizeImageUrl } from '@/lib/product-sources';
import { buildFacetSlug, normalizeBrandName } from '@/lib/facets/normalization';
import { parseShopSitePages } from '@/lib/shopsite/constants';
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
    'title',
    'brand',
    'price',
    'weight',
    'size',
    'attributes',
    'description',
    'long_description',
    'category',
    'categories',
    'product_type',
    'product_on_pages',
    'flavor',
    'color',
    'unit',
    'quantity',
    'ingredients',
    'material',
    'dimensions',
    'specifications',
    'pet_type',
    'lifestage',
    'features',
    'upc',
    'item_number',
    'manufacturer_part_number',
    'case_pack',
    'unit_of_measure',
    'size_options',
    'confidence',
    'source_website',
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
        'pet',
        'age',
        'life',
        'stage',
        'animal',
        'breed',
        'feature',
        'page',
        'value',
        'data',
        'upc',
        'item_number',
        'manufacturer_part',
        'case_pack',
        'uom',
    ];
    return relevantFragments.some((fragment) => normalized.includes(fragment));
}

function isExcludedKeyName(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
        normalized.includes('image') ||
        normalized.includes('url') ||
        normalized.includes('search_keyword') ||
        normalized.includes('searchkeyword') ||
        normalized.includes('taxable') ||
        normalized.includes('special_order') ||
        normalized.includes('specialorder') ||
        normalized.includes('special order') ||
        normalized.includes('manual') ||
        normalized === 'scraped_at' ||
        normalized === '_scraped_at' ||
        normalized.startsWith('_')
    );
}

const EXCLUDED_FROM_LLM = new Set([
    'ratings',
    'reviews_count',
    'availability',
    'scraped_at',
    'search_keywords',
    'is_taxable',
    'taxable',
    'is_special_order',
    'special_order',
    'specialorder',
    'selected_images',
    'manual_selection',
]);

const EXCLUDED_FROM_CONSOLIDATED_MERGE = new Set([
    'is_taxable',
    'taxable',
]);

function pruneExcludedConsolidatedFields(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).filter(([key]) => !EXCLUDED_FROM_CONSOLIDATED_MERGE.has(key))
    );
}

function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim().length === 0) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

function truncateSpecifications(value: string, maxLength = 500): string {
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength).replace(/\s+\S*$/, '…');
}

function sanitizeNestedComposite(value: unknown): unknown {
    if (Array.isArray(value)) {
        const sanitizedItems = value
            .map((entry) => sanitizeNestedComposite(entry))
            .filter((entry) => !isEmptyValue(entry));
        return sanitizedItems.length > 0 ? sanitizedItems : undefined;
    }

    if (!value || typeof value !== 'object') {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length === 0 || trimmed.startsWith('http')) {
                return undefined;
            }
            return trimmed;
        }

        return isEmptyValue(value) ? undefined : value;
    }

    const sanitizedObject: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
        if (isExcludedKeyName(key) || EXCLUDED_FROM_LLM.has(key)) {
            return;
        }

        const sanitizedValue = sanitizeNestedComposite(nestedValue);
        if (!isEmptyValue(sanitizedValue)) {
            sanitizedObject[key] = sanitizedValue;
        }
    });

    return Object.keys(sanitizedObject).length > 0 ? sanitizedObject : undefined;
}

function filterSourceData(sourceData: Record<string, unknown>): Record<string, unknown> {
    const filteredData: Record<string, unknown> = {};

    RELEVANT_FIELDS.forEach((field) => {
        if (EXCLUDED_FROM_LLM.has(field)) return;
        if (!(field in sourceData) || isEmptyValue(sourceData[field])) return;

        let value = sourceData[field];
        if (field === 'specifications' && typeof value === 'string') {
            value = truncateSpecifications(value);
        }

        const sanitizedValue =
            value && typeof value === 'object' ? sanitizeNestedComposite(value) : value;
        if (!isEmptyValue(sanitizedValue)) {
            filteredData[field] = sanitizedValue;
        }
    });

    Object.entries(sourceData).forEach(([key, value]) => {
        if (key in filteredData || isExcludedKeyName(key) || EXCLUDED_FROM_LLM.has(key)) return;
        if (isEmptyValue(value)) return;

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
            const sanitizedValue = sanitizeNestedComposite(value);
            if (isEmptyValue(sanitizedValue)) {
                return;
            }

            try {
                const json = JSON.stringify(sanitizedValue);
                if (json.length > 2 && json.length < 1000 && hasRelevantKeyName(key)) {
                    filteredData[key] = sanitizedValue;
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
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();

    // 1. Try to find by openai_batch_id if it's not a UUID
    if (!isUuid(batchIdentifier)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('id, metadata')
            .eq('openai_batch_id', batchIdentifier)
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST204') {
            return { row: null, lookupError: error.message };
        }
        if (data) {
            return { row: data as BatchRowLookup, lookupError: null };
        }
    }

    // 2. Try to find by primary key if it IS a UUID
    if (isUuid(batchIdentifier)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('id, metadata')
            .eq('id', batchIdentifier)
            .limit(1)
            .maybeSingle();

        if (error) {
            return { row: null, lookupError: error.message };
        }

        return { row: (data as BatchRowLookup | null) || null, lookupError: null };
    }

    return { row: null, lookupError: null };
}

async function resolveOpenAIBatchId(batchIdentifier: string): Promise<string> {
    if (!isUuid(batchIdentifier)) {
        return batchIdentifier;
    }

    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('batch_jobs')
        .select('openai_batch_id')
        .eq('id', batchIdentifier)
        .limit(1)
        .maybeSingle();

    if (error || !data || !data.openai_batch_id) {
        // If we can't resolve it (column missing or null), 
        // return the identifier as is - maybe it was used as the PK.
        return batchIdentifier;
    }

    return data.openai_batch_id;
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

type SourceTrustLevel = 'canonical' | 'trusted' | 'standard' | 'marketplace';
type AnimalSignal = 'dog' | 'cat' | 'horse' | 'bird' | 'small-pet';

const MARKETPLACE_SOURCE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller'];
const TRUSTED_SOURCE_FRAGMENTS = [
    'shopsite_input',
    'bradley',
    'central-pet',
    'central_pet',
    'orgill',
    'doitbest',
    'do_it_best',
    'manufacturer',
    'catalog',
    'distributor',
];
const ANIMAL_SIGNAL_RULES: Array<{ label: AnimalSignal; patterns: RegExp[] }> = [
    { label: 'dog', patterns: [/\bdog\b/i, /\bpuppy\b/i, /\bcanine\b/i] },
    { label: 'cat', patterns: [/\bcat\b/i, /\bkitten\b/i, /\bfeline\b/i] },
    { label: 'horse', patterns: [/\bhorse\b/i, /\bhorses\b/i, /\bequine\b/i] },
    { label: 'bird', patterns: [/\bbird\b/i, /\bavian\b/i, /\bparrot\b/i] },
    {
        label: 'small-pet',
        patterns: [/\bsmall pet\b/i, /\bhamster\b/i, /\bgerbil\b/i, /\bguinea pig\b/i, /\brabbit\b/i, /\bferret\b/i],
    },
];

interface PromptSourceEvidence {
    source: string;
    trust: SourceTrustLevel;
    fields: Record<string, unknown>;
}

interface PendingConsolidationRow {
    sku: string;
    next_fields: Record<string, unknown>;
    pipeline_status: PipelineStatus;
    pipeline_status_new: PipelineStatus;
    confidence_score: number | null;
    error_message: string | null;
    outcome: 'finalized' | 'rejected';
    name_key?: string;
    existing_consolidated?: Record<string, unknown>;
}

function getSourceTrustLevel(sourceName: string): SourceTrustLevel {
    const normalized = sourceName.toLowerCase();

    if (normalized === 'shopsite_input') {
        return 'canonical';
    }

    if (MARKETPLACE_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 'marketplace';
    }

    if (TRUSTED_SOURCE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
        return 'trusted';
    }

    return 'standard';
}

function getSourceTrustRank(trust: SourceTrustLevel): number {
    switch (trust) {
        case 'canonical':
            return 0;
        case 'trusted':
            return 1;
        case 'standard':
            return 2;
        case 'marketplace':
            return 3;
        default:
            return 4;
    }
}

function cleanBrandLabel(rawBrandName: unknown): string | undefined {
    if (typeof rawBrandName !== 'string') {
        return undefined;
    }

    const stripped = rawBrandName.replace(/^brand\s*:\s*/i, '').trim();
    return normalizeBrandName(stripped) || undefined;
}

function buildPromptSourceEvidence(filteredSources: Record<string, unknown>): PromptSourceEvidence[] {
    return Object.entries(filteredSources)
        .filter(([, data]) => data && typeof data === 'object' && !Array.isArray(data))
        .map(([source, data]) => ({
            source,
            trust: getSourceTrustLevel(source),
            fields: data as Record<string, unknown>,
        }))
        .sort((left, right) => {
            const trustComparison = getSourceTrustRank(left.trust) - getSourceTrustRank(right.trust);
            if (trustComparison !== 0) {
                return trustComparison;
            }

            return left.source.localeCompare(right.source);
        });
}

function collectAnimalSignalsFromValue(
    value: unknown,
    detected: Set<AnimalSignal>,
    depth: number = 0
): void {
    if (depth > 5 || value === null || value === undefined) {
        return;
    }

    if (typeof value === 'string') {
        for (const rule of ANIMAL_SIGNAL_RULES) {
            if (rule.patterns.some((pattern) => pattern.test(value))) {
                detected.add(rule.label);
            }
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => collectAnimalSignalsFromValue(entry, detected, depth + 1));
        return;
    }

    if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((entry) =>
            collectAnimalSignalsFromValue(entry, detected, depth + 1)
        );
    }
}

function collectExpectedAnimalSignals(
    input: Record<string, unknown>,
    sources: Record<string, unknown>
): Set<AnimalSignal> {
    const detected = new Set<AnimalSignal>();

    collectAnimalSignalsFromValue(input, detected);

    for (const [sourceName, sourcePayload] of Object.entries(normalizeProductSources(sources))) {
        if (getSourceTrustLevel(sourceName) === 'marketplace') {
            continue;
        }

        collectAnimalSignalsFromValue(sourcePayload, detected);
    }

    return detected;
}

function collectOutputAnimalSignals(nextFields: Record<string, unknown>): Set<AnimalSignal> {
    const detected = new Set<AnimalSignal>();
    collectAnimalSignalsFromValue(nextFields.category, detected);
    collectAnimalSignalsFromValue(nextFields.product_type, detected);
    collectAnimalSignalsFromValue(nextFields.product_on_pages, detected);
    return detected;
}

function summarizeAnimalSignals(signals: Iterable<AnimalSignal>): string {
    return Array.from(signals).sort().join(', ');
}

function getPreferredTrustedBrand(
    sources: Record<string, unknown>
): { brand: string; source: string } | null {
    const evidence = buildPromptSourceEvidence(normalizeProductSources(sources));

    for (const source of evidence) {
        if (source.trust === 'marketplace') {
            continue;
        }

        const brand = cleanBrandLabel(source.fields.brand);
        if (brand) {
            return {
                brand,
                source: source.source,
            };
        }
    }

    return null;
}

function toStringUrlArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const urls = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => normalizeImageUrl(entry))
        .filter((entry) => entry.length > 0);
    
    return Array.from(new Set(urls));
}

function extractSelectedImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const urls = value
        .map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }

            if (entry && typeof entry === 'object' && 'url' in entry) {
                const url = (entry as { url?: unknown }).url;
                return typeof url === 'string' ? url : null;
            }

            return null;
        })
        .filter((url): url is string => typeof url === 'string')
        .map((url) => normalizeImageUrl(url))
        .filter((url) => url.length > 0);
    
    return Array.from(new Set(urls));
}

/**
 * Create a JSONL batch file content for product consolidation.
 */
export function createBatchContent(
    products: ProductSource[],
    systemPrompt: string,
    responseFormat?: object,
    config?: { model: string; maxTokens: number; temperature: number }
): string {
    const lines: string[] = [];

    const model = config?.model || CONSOLIDATION_CONFIG.model;
    const maxTokens = config?.maxTokens || CONSOLIDATION_CONFIG.maxTokens;
    const temperature = config?.temperature || CONSOLIDATION_CONFIG.temperature;

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

        const sourceEvidence = buildPromptSourceEvidence(filteredSources);
        const userPrompt = `Consolidate this product into a canonical record using the provided source trust metadata and only source-supported values: ${JSON.stringify({
            sku: product.sku,
            sources: sourceEvidence,
        })}`;

        const request = {
            custom_id: product.sku,
            method: 'POST',
            url: '/v1/chat/completions',
            body: {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: maxTokens,
                temperature: temperature,
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
    const client = await getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    try {
        // Load runtime config (key-version, model, etc.)
        const config = await getConsolidationConfig();

        // Build prompt context with taxonomy
        const { systemPrompt, categories, productTypes, shopsitePages = [] } = await buildPromptContext();

        // Build JSON schema with enum constraints
        const responseFormat = buildResponseSchema(categories, productTypes, shopsitePages);

        // Create JSONL content
        const content = createBatchContent(products, systemPrompt, responseFormat, config);
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
            completion_window: config.completionWindow,
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
            console.error('[Consolidation] Failed to track batch in database:', dbError);
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
    const client = await getOpenAIClient();
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
            prompt_tokens: (batch as unknown as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens,
            completion_tokens: (batch as unknown as { usage?: { completion_tokens?: number } }).usage?.completion_tokens,
            total_tokens: (batch as unknown as { usage?: { total_tokens?: number } }).usage?.total_tokens,
            created_at: batch.created_at,
            completed_at: batch.completed_at,
            metadata: (batch.metadata || {}) as BatchMetadata,
        };

        // Sync status to Supabase
        const { createAdminClient } = await import('@/lib/supabase/server');
        const supabase = await createAdminClient();
        const updateData: Record<string, unknown> = {
            status: batch.status,
            total_requests: requestCounts.total || 0,
            completed_requests: requestCounts.completed || 0,
            failed_requests: requestCounts.failed || 0,
            prompt_tokens: (batch as unknown as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens || 0,
            completion_tokens: (batch as unknown as { usage?: { completion_tokens?: number } }).usage?.completion_tokens || 0,
            total_tokens: (batch as unknown as { usage?: { total_tokens?: number } }).usage?.total_tokens || 0,
            output_file_id: batch.output_file_id,
            error_file_id: batch.error_file_id,
        };

        if (batch.completed_at) {
            updateData.completed_at = new Date(batch.completed_at * 1000).toISOString();
        }

        const upsertPayload = {
            ...updateData,
            openai_batch_id: batch.id,
            input_file_id: batch.input_file_id,
        };

        const { error: upsertError } = await supabase
            .from('batch_jobs')
            .upsert(upsertPayload, { onConflict: 'openai_batch_id' });

        if (upsertError && upsertError.code === 'PGRST204') {
            console.warn('[Consolidation] openai_batch_id missing during status sync, falling back to id lookup');
            // Find by UUID if possible, or just skip sync
            const { row } = await findBatchJobRow(batch.id);
            if (row) {
                await supabase.from('batch_jobs').update(updateData).eq('id', row.id);
            }
        } else if (upsertError) {
            console.warn('[Consolidation] Failed to sync batch status to DB:', upsertError.message);
        }

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
    const client = await getOpenAIClient();
    if (!client) {
        return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
        // Fetch taxonomy for validation
        const { categories, productTypes, shopsitePages = [] } = await buildPromptContext();

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
                    let sku = 'unknown';
                    try {
                        const result = JSON.parse(line);
                        sku = result.custom_id || 'unknown';

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
                            const normalized = normalizeConsolidationResult(parsed, shopsitePages);
                            const requiredFieldsValidated = validateRequiredConsolidationFields(normalized);
                            const validated = validateConsolidationTaxonomy(requiredFieldsValidated, categories, productTypes);

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

                            // Convert product_on_pages array to pipe-delimited string
                            const productOnPages = Array.isArray(validated.product_on_pages)
                                ? (validated.product_on_pages as string[]).join('|')
                                : typeof validated.product_on_pages === 'string'
                                    ? validated.product_on_pages
                                    : undefined;

                            results.push({
                                sku,
                                ...validated,
                                category: normalizedCategory.join('|'),
                                product_type: normalizedProductType.join('|'),
                                ...(productOnPages ? { product_on_pages: productOnPages } : {}),
                            } as ConsolidationResult);
                        } else {
                            results.push({ sku, error: 'Failed to parse JSON response' });
                        }
                    } catch (e) {
                        results.push({
                            sku,
                            error: e instanceof Error ? e.message : 'Failed to parse structured output',
                        });
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

    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();
    const config = await getConsolidationConfig();
    const confidenceThreshold =
        typeof config.confidence_threshold === 'number' && Number.isFinite(config.confidence_threshold)
            ? config.confidence_threshold
            : 0.7;
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

    const resultSkus = Array.from(new Set(results.map((result) => result.sku).filter((sku) => sku && sku.length > 0)));

    let existingRows: Array<{
        sku: string;
        consolidated: unknown;
        sources: unknown;
        input: unknown;
        image_candidates: unknown;
        selected_images: unknown;
    }> = [];
    if (resultSkus.length > 0) {
        const existingRowsResponse = await supabase
            .from('products_ingestion')
            .select('sku, consolidated, sources, input, image_candidates, selected_images')
            .in('sku', resultSkus);

        if (existingRowsResponse.error) {
            return { success: false, error: `Failed to load existing products: ${existingRowsResponse.error.message}` };
        }

        existingRows = (existingRowsResponse.data || []) as Array<{
            sku: string;
            consolidated: unknown;
            sources: unknown;
            input: unknown;
            image_candidates: unknown;
            selected_images: unknown;
        }>;
    }

    const existingBySku = new Map<
        string,
        {
            consolidated: Record<string, unknown>;
            sources: Record<string, unknown>;
            input: Record<string, unknown>;
            imageCandidates: string[];
            selectedImages: string[];
        }
    >();
    for (const row of existingRows) {
        const consolidated = row.consolidated;
        const sources = row.sources;
        const input = row.input;
        const imageCandidates = toStringUrlArray(row.image_candidates);
        const selectedImages = extractSelectedImageUrls(row.selected_images);

        const consolidatedRecord =
            consolidated && typeof consolidated === 'object' && !Array.isArray(consolidated)
                ? (consolidated as Record<string, unknown>)
                : {};

        const sourceRecord =
            sources && typeof sources === 'object' && !Array.isArray(sources)
                ? (sources as Record<string, unknown>)
                : {};
        const inputRecord =
            input && typeof input === 'object' && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : {};

        if (consolidated && typeof consolidated === 'object' && !Array.isArray(consolidated)) {
            existingBySku.set(row.sku, {
                consolidated: consolidatedRecord,
                sources: sourceRecord,
                input: inputRecord,
                imageCandidates,
                selectedImages,
            });
        } else {
            existingBySku.set(row.sku, {
                consolidated: consolidatedRecord,
                sources: sourceRecord,
                input: inputRecord,
                imageCandidates,
                selectedImages,
            });
        }
    }

    const { data: brands, error: brandsError } = await supabase.from('brands').select('id, name, slug');
    if (brandsError) {
        return { success: false, error: `Failed to load brands: ${brandsError.message}` };
    }

    const brandIdByName = new Map<string, string>();
    const brandIdBySlug = new Map<string, string>();
    for (const brand of brands || []) {
        if (typeof brand.name === 'string' && typeof brand.id === 'string') {
            brandIdByName.set(normalizeLookupKey(brand.name), brand.id);
            const brandSlug =
                typeof brand.slug === 'string' && brand.slug.length > 0
                    ? brand.slug
                    : buildFacetSlug(brand.name);
            if (brandSlug) {
                brandIdBySlug.set(brandSlug, brand.id);
            }
        }
    }

    const resolveBrand = async (
        rawBrandName: string | undefined
    ): Promise<{ brandId?: string; brandName?: string }> => {
        const normalizedBrand = normalizeBrandName(rawBrandName);
        if (!normalizedBrand) {
            return {};
        }

        const lookupKey = normalizeLookupKey(normalizedBrand);
        const existingBrandId = brandIdByName.get(lookupKey);
        if (existingBrandId) {
            return {
                brandId: existingBrandId,
                brandName: normalizedBrand,
            };
        }

        const slug = buildFacetSlug(normalizedBrand);
        if (!slug) {
            throw new Error(`Invalid brand name: "${normalizedBrand}"`);
        }

        const existingBrandIdBySlug = brandIdBySlug.get(slug);
        if (existingBrandIdBySlug) {
            brandIdByName.set(lookupKey, existingBrandIdBySlug);
            return {
                brandId: existingBrandIdBySlug,
                brandName: normalizedBrand,
            };
        }

        const { data: createdBrand, error: createBrandError } = await supabase
            .from('brands')
            .insert({
                name: normalizedBrand,
                slug,
            })
            .select('id')
            .single();

        const createdBrandId = createdBrand?.id;
        if (typeof createdBrandId === 'string' && createdBrandId.length > 0) {
            brandIdByName.set(lookupKey, createdBrandId);
            brandIdBySlug.set(slug, createdBrandId);
            return {
                brandId: createdBrandId,
                brandName: normalizedBrand,
            };
        }

        const { data: existingBrand, error: existingBrandError } = await supabase
            .from('brands')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

        const existingBrandIdAfterInsert = existingBrand?.id;
        if (typeof existingBrandIdAfterInsert === 'string' && existingBrandIdAfterInsert.length > 0) {
            brandIdByName.set(lookupKey, existingBrandIdAfterInsert);
            brandIdBySlug.set(slug, existingBrandIdAfterInsert);
            return {
                brandId: existingBrandIdAfterInsert,
                brandName: normalizedBrand,
            };
        }

        const details = [
            createBrandError?.message ? `create failed: ${createBrandError.message}` : null,
            existingBrandError?.message ? `lookup failed: ${existingBrandError.message}` : null,
        ]
            .filter(Boolean)
            .join('; ');

        throw new Error(`Failed to resolve brand "${normalizedBrand}"${details ? ` (${details})` : ''}`);
    };

    const updateRows: PendingConsolidationRow[] = [];

    for (const result of results) {
        try {
            if (!existingBySku.has(result.sku)) {
                errorCount++;
                if (errors.length < 10) {
                    errors.push(`${result.sku}: missing products_ingestion row; skipped stale consolidation result`);
                }
                continue;
            }

            const existingRecord = existingBySku.get(result.sku);
            const existingConsolidated = existingRecord?.consolidated || {};

            if (result.error) {
                if (errors.length < 10) {
                    errors.push(`${result.sku}: ${result.error}`);
                }

                updateRows.push({
                    sku: result.sku,
                    next_fields: {},
                    pipeline_status: 'enriched',
                    pipeline_status_new: 'enriched',
                    confidence_score: null,
                    error_message: result.error,
                    outcome: 'rejected',
                    existing_consolidated: existingConsolidated,
                });
                continue;
            }

            const normalizedBrand = cleanBrandLabel(result.brand);

            const nextCategory = parseDelimitedTaxonomy(result.category);
            const nextProductType = parseDelimitedTaxonomy(result.product_type);
            const parsedPrice =
                typeof result.price === 'number'
                    ? result.price
                    : typeof result.price === 'string'
                        ? Number.parseFloat(result.price)
                        : Number.NaN;

            const nextFields: Record<string, unknown> = {
                ...(typeof result.name === 'string' && result.name.trim() ? { name: result.name.trim() } : {}),
                ...(typeof result.description === 'string' && result.description.trim()
                    ? { description: result.description.trim() }
                    : {}),
                ...(typeof result.long_description === 'string' && result.long_description.trim()
                    ? { long_description: result.long_description.trim() }
                    : {}),
                ...(typeof result.search_keywords === 'string' && result.search_keywords.trim()
                    ? { search_keywords: result.search_keywords.trim() }
                    : {}),
                ...(typeof result.weight === 'string' && result.weight.trim() ? { weight: result.weight.trim() } : {}),
                ...(Number.isFinite(parsedPrice) ? { price: parsedPrice } : {}),
                ...(normalizedBrand ? { brand: normalizedBrand } : {}),
                ...(nextCategory.length > 0 ? { category: nextCategory.join('|') } : {}),
                ...(nextProductType.length > 0 ? { product_type: nextProductType.join('|') } : {}),
                ...(typeof result.confidence_score === 'number'
                    ? { confidence_score: result.confidence_score }
                    : {}),
            };

            const existingConsolidatedImages = toStringUrlArray(existingConsolidated.images);
            if (existingConsolidatedImages.length > 0) {
                nextFields.images = existingConsolidatedImages;
            } else {
                const selectedImages = existingRecord?.selectedImages || [];
                const imageCandidates = existingRecord?.imageCandidates || [];
                const sourceCandidates = extractImageCandidatesFromSources(
                    existingRecord?.sources || {},
                    24,
                );
                const fallbackImages =
                    selectedImages.length > 0
                        ? selectedImages
                        : imageCandidates.length > 0
                            ? imageCandidates.slice(0, 10)
                            : sourceCandidates.slice(0, 10);

                if (fallbackImages.length > 0) {
                    nextFields.images = fallbackImages;
                }
            }

            // Handle product_on_pages (stored as array in consolidated jsonb)
            {
                const pages = result.product_on_pages
                    ? parseShopSitePages(result.product_on_pages)
                    : parseShopSitePages(existingRecord?.input.product_on_pages);
                if (pages.length > 0) {
                    nextFields.product_on_pages = pages;
                }
            }

            const gateErrors: string[] = [];

            try {
                validateRequiredConsolidationFields({
                    name: nextFields.name,
                    brand: nextFields.brand,
                    description: nextFields.description,
                    long_description: nextFields.long_description,
                    search_keywords: nextFields.search_keywords,
                    confidence_score: result.confidence_score,
                });
            } catch (validationError: unknown) {
                gateErrors.push(
                    validationError instanceof Error ? validationError.message : 'Invalid consolidation output'
                );
            }

            if (
                typeof result.confidence_score === 'number'
                && Number.isFinite(result.confidence_score)
                && result.confidence_score < confidenceThreshold
            ) {
                gateErrors.push(
                    `confidence_score ${result.confidence_score.toFixed(2)} is below threshold ${confidenceThreshold.toFixed(2)}`
                );
            }

            const preferredTrustedBrand = getPreferredTrustedBrand(existingRecord?.sources || {});
            if (
                preferredTrustedBrand
                && normalizedBrand
                && normalizeLookupKey(preferredTrustedBrand.brand) !== normalizeLookupKey(normalizedBrand)
            ) {
                gateErrors.push(
                    `brand "${normalizedBrand}" conflicts with higher-trust source "${preferredTrustedBrand.source}" brand "${preferredTrustedBrand.brand}"`
                );
            }

            const outputAnimalSignals = collectOutputAnimalSignals(nextFields);
            const expectedAnimalSignals = collectExpectedAnimalSignals(
                existingRecord?.input || {},
                existingRecord?.sources || {}
            );
            const unexpectedAnimalSignals = Array.from(outputAnimalSignals).filter(
                (signal) => expectedAnimalSignals.size > 0 && !expectedAnimalSignals.has(signal)
            );

            if (unexpectedAnimalSignals.length > 0) {
                gateErrors.push(
                    `taxonomy/pages target ${unexpectedAnimalSignals.join(', ')} but trusted source evidence supports ${summarizeAnimalSignals(expectedAnimalSignals)}`
                );
            }

            const pages = Array.isArray(nextFields.product_on_pages)
                ? (nextFields.product_on_pages as string[])
                : [];
            if (pages.length === 0) {
                gateErrors.push('product_on_pages is required to finalize');
            }

            if (gateErrors.length > 0) {
                const errorMessage = gateErrors.join('; ');
                if (errors.length < 10) {
                    errors.push(`${result.sku}: ${errorMessage}`);
                }

                updateRows.push({
                    sku: result.sku,
                    next_fields: {},
                    pipeline_status: 'enriched',
                    pipeline_status_new: 'enriched',
                    confidence_score: result.confidence_score ?? null,
                    error_message: errorMessage,
                    outcome: 'rejected',
                    existing_consolidated: existingConsolidated,
                });
                continue;
            }

            const {
                brandId: resolvedBrandId,
                brandName: resolvedBrandName,
            } = await resolveBrand(normalizedBrand);

            if (normalizedBrand) {
                if (resolvedBrandId) {
                    matchedBrandCount += 1;
                } else {
                    unresolvedBrandCount += 1;
                }
            }

            if (resolvedBrandName) {
                nextFields.brand = resolvedBrandName;
            }
            if (resolvedBrandId) {
                nextFields.brand_id = resolvedBrandId;
            }

            updateRows.push({
                sku: result.sku,
                next_fields: nextFields,
                pipeline_status: 'finalized',
                pipeline_status_new: 'finalized',
                confidence_score: result.confidence_score ?? null,
                error_message: null,
                outcome: 'finalized',
                name_key: typeof nextFields.name === 'string' ? normalizeLookupKey(nextFields.name) : undefined,
                existing_consolidated: existingConsolidated,
            });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            if (errors.length < 10) {
                errors.push(`${result.sku}: ${errorMessage}`);
            }

            const existingConsolidated = existingBySku.get(result.sku)?.consolidated || {};
            updateRows.push({
                sku: result.sku,
                next_fields: {},
                pipeline_status: 'enriched',
                pipeline_status_new: 'enriched',
                confidence_score: typeof result.confidence_score === 'number' ? result.confidence_score : null,
                error_message: errorMessage,
                outcome: 'rejected',
                existing_consolidated: existingConsolidated,
            });
        }
    }

    const duplicateNameGroups = new Map<string, PendingConsolidationRow[]>();
    for (const row of updateRows) {
        if (row.outcome !== 'finalized' || !row.name_key) {
            continue;
        }

        const group = duplicateNameGroups.get(row.name_key) || [];
        group.push(row);
        duplicateNameGroups.set(row.name_key, group);
    }

    for (const group of duplicateNameGroups.values()) {
        if (group.length < 2) {
            continue;
        }

        const duplicateName =
            typeof group[0]?.next_fields.name === 'string'
                ? group[0].next_fields.name
                : 'duplicate consolidation name';
        const errorMessage = `duplicate finalized name "${duplicateName}" across SKUs ${group.map((row) => row.sku).join(', ')}`;

        for (const row of group) {
            row.outcome = 'rejected';
            row.pipeline_status = 'enriched';
            row.pipeline_status_new = 'enriched';
            row.error_message = errorMessage;
            row.next_fields = {};
            if (errors.length < 10) {
                errors.push(`${row.sku}: ${errorMessage}`);
            }
        }
    }

    for (const row of updateRows) {
        if (row.outcome !== 'finalized') {
            continue;
        }

        const existingConsolidated = row.existing_consolidated || {};
        Object.entries(row.next_fields).forEach(([key, value]) => {
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
    }

    if (updateRows.length > 0) {
        for (const row of updateRows) {
            const maxAttempts = 3;
            let applied = false;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const { data: latestRow, error: latestError } = await supabase
                    .from('products_ingestion')
                    .select('consolidated, updated_at')
                    .eq('sku', row.sku)
                    .maybeSingle();

                if (latestError) {
                    return {
                        success: false,
                        error: `Failed to load latest products_ingestion row for ${row.sku}: ${latestError.message}`,
                    };
                }

                if (!latestRow) {
                    errorCount++;
                    if (errors.length < 10) {
                        errors.push(`${row.sku}: products_ingestion row deleted before apply; skipped stale consolidation result`);
                    }
                    applied = true;
                    break;
                }

                const currentConsolidated =
                    latestRow.consolidated && typeof latestRow.consolidated === 'object' && !Array.isArray(latestRow.consolidated)
                        ? (latestRow.consolidated as Record<string, unknown>)
                        : {};

                const prunedCurrentConsolidated = pruneExcludedConsolidatedFields(currentConsolidated);
                const prunedNextFields = pruneExcludedConsolidatedFields(row.next_fields);

                const mergedConsolidated = {
                    ...prunedCurrentConsolidated,
                    ...prunedNextFields,
                };

                const applyTimestamp = new Date().toISOString();
                let updateQuery = supabase
                    .from('products_ingestion')
                    .update({
                        consolidated: mergedConsolidated,
                        pipeline_status: row.pipeline_status,
                        pipeline_status_new: row.pipeline_status_new,
                        confidence_score: row.confidence_score,
                        error_message: row.error_message,
                        updated_at: applyTimestamp,
                    })
                    .eq('sku', row.sku);

                if (typeof latestRow.updated_at === 'string' && latestRow.updated_at.length > 0) {
                    updateQuery = updateQuery.eq('updated_at', latestRow.updated_at);
                }

                const { data: updatedRow, error: updateError } = await updateQuery
                    .select('sku')
                    .maybeSingle();

                if (updateError) {
                    return {
                        success: false,
                        error: `Failed to apply consolidation for ${row.sku}: ${updateError.message}`,
                    };
                }

                    if (updatedRow) {
                        if (row.outcome === 'finalized') {
                            successCount++;
                        } else {
                            errorCount++;
                        }
                        applied = true;
                        break;
                    }

                if (attempt === maxAttempts) {
                    return {
                        success: false,
                        error: `Failed to apply consolidation for ${row.sku}: concurrent update contention`,
                    };
                }
            }

            if (!applied) {
                return {
                    success: false,
                    error: `Failed to apply consolidation for ${row.sku}: unknown apply state`,
                };
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
        const { createAdminClient } = await import('@/lib/supabase/server');
        const supabase = await createAdminClient();
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
    const client = await getOpenAIClient();
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
