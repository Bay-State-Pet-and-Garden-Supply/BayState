/**
 * Consolidation Batch Service
 *
 * Orchestrates product data consolidation through two execution modes:
 * - `batch_api`: Provider-owned batch lifecycle (OpenAI /v1/batches)
 * - `direct_chat_chunks`: Application-owned direct chat completions (DeepSeek, LM Studio)
 *
 * For provider-normalized pipeline status display, prefer:
 * - PipelineRunSummary types from `@/lib/pipeline/run-types`
 * - The unified `GET /api/admin/pipeline/runs` endpoint
 *
 * Ported and adapted from BayStateTools.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
    CONSOLIDATION_CONFIG,
    getConsolidationConfig,
    getOpenAIClient,
    type ConsolidationRuntimeConfig,
} from './openai-client';
import { buildPromptContext, buildUserPrompt, generateGroupConsolidationSystemPrompt, buildGroupUserPromptPayload } from './prompt-builder';
import {
    buildJSONResponseFormat,
    buildResponseSchema,
    validateCategory,
    validateConsolidationTaxonomy,

    validateRequiredConsolidationFields,
} from './taxonomy-validator';
import { parseStructuredConsolidationText } from './result-parsing';
import { calculateAICost } from '@/lib/ai-scraping/pricing';
import { getAIScrapingProviderSecret } from '@/lib/ai-scraping/credentials';
import { normalizeProductSources, normalizeImageUrl, buildConsolidationSourcesPayload } from '@/lib/product-sources';
import { buildFacetSlug, canonicalizeBrandName, normalizeBrandName } from '@/lib/facets/normalization';
import { parseShopSitePages } from '@/lib/shopsite/constants';
import { parseTaxonomyValues } from '@/lib/taxonomy';
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
    BatchExecutionMode,
} from './types';

import {
    preflightModels,
    createDirectChatBatch,
    processDirectChatChunk,
    getDirectChatStatusSnapshot,
    aggregateDirectChatStatus,
    retrieveDirectChatResults,
    cancelDirectChatBatch,
} from './direct-chat-service';

import {
    createGeminiBatchJob,
    prepareGeminiBatchChunk,
    submitPreparedGeminiBatch,
    syncGeminiBatchStatus,
    retrieveGeminiBatchResults,
    cancelGeminiBatch as cancelGeminiBatchProvider,
    buildGeminiBatchStatus,
} from './gemini-batch-service';
import { enrichProductDetails } from './detail-enrichment';
import { classifyProduct, extractClassificationEvidence, isConfidentClassification, buildClassificationSystemPrompt, buildClassificationUserPrompt } from './product-line-classification';
import { loadKnownProductLines, assignProductToLine } from './product-lines';
import { deduplicateProductLines } from './product-line-dedup';
import crypto from 'crypto';

// =============================================================================
// Batch Content Generation
// =============================================================================

/**
 * Fields relevant for classification - inclusion list.
 */
const RELEVANT_FIELDS = [
    'title',
    'brand',
    'weight',
    'size',
    'package_weight',
    'package-weight',
    'count',
    'pack',
    'attributes',
    'description',
    'category',
    'categories',
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
    'image_text',
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
        'flavor',
        'colour',
        'color',
        'unit',
        'quantity',
        'material',
        'ingredient',
        'dimension',
        'spec',
        'title',
        'confidence',
        'categories',
        'pet',
        'age',
        'life',
        'stage',
        'animal',
        'breed',
        'feature',
        'page',
        'upc',
        'item_number',
        'manufacturer_part',
        'case_pack',
        'uom',
        'count',
        'pack',
    ];
    return relevantFragments.some((fragment) => normalized.includes(fragment));
}

function isExcludedKeyName(key: string): boolean {
    const normalized = key.toLowerCase();
    // OCR packaging text is not an image URL — allow it through
    if (normalized === 'image_text') return false;
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
    'brand',
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
const MAX_PROMPT_SOURCES = 4;
const MAX_PROMPT_FALLBACK_FIELDS = 4;
const MAX_PROMPT_ARRAY_ITEMS = 8;
const MAX_PROMPT_NESTED_KEYS = 8;

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

function getPromptTextLimit(fieldName: string): number {
    switch (fieldName.toLowerCase()) {
        case 'title':
        case 'name':
            return 180;
        case 'brand':
            return 80;
        case 'description':
            return 2000;
        case 'image_text':
            return 2000;
        case 'specifications':
            return 2000;
        case 'dimensions':
            return 140;
        default:
            return 120;
    }
}

function truncatePromptText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    const truncated = trimmed.slice(0, maxLength).replace(/\s+\S*$/, '').trimEnd();
    return `${truncated || trimmed.slice(0, maxLength).trimEnd()}…`;
}

function sanitizePrimitivePromptValue(fieldName: string, value: unknown): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0 || trimmed.startsWith('http')) {
            return undefined;
        }

        return truncatePromptText(trimmed, getPromptTextLimit(fieldName));
    }

    return isEmptyValue(value) ? undefined : value;
}

function sanitizeNestedComposite(
    value: unknown,
    fieldName: string = '',
    depth: number = 0
): unknown {
    if (depth > 3) {
        return undefined;
    }

    if (Array.isArray(value)) {
        const sanitizedItems = value
            .map((entry) => sanitizeNestedComposite(entry, fieldName, depth + 1))
            .filter((entry) => !isEmptyValue(entry))
            .slice(0, MAX_PROMPT_ARRAY_ITEMS);
        return sanitizedItems.length > 0 ? sanitizedItems : undefined;
    }

    if (!value || typeof value !== 'object') {
        return sanitizePrimitivePromptValue(fieldName, value);
    }

    const sanitizedObject: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).some(([key, nestedValue]) => {
        if (Object.keys(sanitizedObject).length >= MAX_PROMPT_NESTED_KEYS) {
            return true;
        }

        if (isExcludedKeyName(key) || EXCLUDED_FROM_LLM.has(key)) {
            return false;
        }

        const sanitizedValue = sanitizeNestedComposite(nestedValue, key, depth + 1);
        if (!isEmptyValue(sanitizedValue)) {
            sanitizedObject[key] = sanitizedValue;
        }
        return false;
    });

    return Object.keys(sanitizedObject).length > 0 ? sanitizedObject : undefined;
}

function filterSourceData(sourceData: Record<string, unknown>): Record<string, unknown> {
    const filteredData: Record<string, unknown> = {};

    RELEVANT_FIELDS.forEach((field) => {
        if (EXCLUDED_FROM_LLM.has(field)) return;
        if (!(field in sourceData) || isEmptyValue(sourceData[field])) return;

        const value = sourceData[field];
        const sanitizedValue =
            value && typeof value === 'object'
                ? sanitizeNestedComposite(value, field)
                : sanitizePrimitivePromptValue(field, value);
        if (!isEmptyValue(sanitizedValue)) {
            filteredData[field] = sanitizedValue;
        }
    });

    let fallbackFieldsAdded = 0;
    Object.entries(sourceData).forEach(([key, value]) => {
        if (
            fallbackFieldsAdded >= MAX_PROMPT_FALLBACK_FIELDS
            || key in filteredData
            || isExcludedKeyName(key)
            || EXCLUDED_FROM_LLM.has(key)
            || !hasRelevantKeyName(key)
        ) {
            return;
        }

        if (isEmptyValue(value)) return;

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            const sanitizedValue = sanitizePrimitivePromptValue(key, value);
            if (!isEmptyValue(sanitizedValue)) {
                filteredData[key] = sanitizedValue;
                fallbackFieldsAdded += 1;
            }
            return;
        }

        if (Array.isArray(value)) {
            const sanitizedValue = sanitizeNestedComposite(value, key);
            if (Array.isArray(sanitizedValue) && sanitizedValue.length > 0) {
                filteredData[key] = sanitizedValue;
                fallbackFieldsAdded += 1;
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

export interface BatchRowLookup {
    id: string;
    provider: string;
    provider_batch_id: string | null;
    total_requests?: number | null;
    completed_requests?: number | null;
    failed_requests?: number | null;
    metadata: Record<string, unknown> | null;
    execution_mode?: string | null;
    parent_batch_id?: string | null;
}



type BatchProviderKey = 'deepseek' | 'gemini';

function normalizeBatchProvider(value: unknown): BatchProviderKey {
    if (typeof value === 'string' && value === 'gemini') {
        return 'gemini';
    }
    if (typeof value === 'string' && value === 'deepseek') {
        return 'deepseek';
    }
    // All legacy providers (openai, lmstudio, openai_compatible) normalize to deepseek
    return 'deepseek';
}

function buildBatchRoutingKey(products: ProductSource[], metadata: BatchMetadata): string {
    // NEW: Route by product line if available for improved consistency
    const firstProduct = products[0];
    const productLine = firstProduct?.productLineContext?.productLine;
    if (productLine && typeof productLine === 'string' && productLine.trim().length > 0) {
        return `product-line:${productLine.trim()}`;
    }

    // Fallback to existing behavior: explicit metadata keys
    const explicitKey =
        typeof metadata.scrape_job_id === 'string' && metadata.scrape_job_id.trim().length > 0
            ? metadata.scrape_job_id.trim()
            : typeof metadata.description === 'string' && metadata.description.trim().length > 0
                ? metadata.description.trim()
                : null;

    if (explicitKey) {
        return explicitKey;
    }

    // Final fallback: UPCs sorted
    return products
        .map((product) => product.upc.trim())
        .filter((upc) => upc.length > 0)
        .sort()
        .join('|');
}

export async function findBatchJobRow(
    batchIdentifier: string
): Promise<{ row: BatchRowLookup | null; lookupError: string | null }> {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();

    // 1. Try to find by provider-native identifiers if it's not a UUID.
    if (!isUuid(batchIdentifier)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('id, provider, provider_batch_id, openai_batch_id, total_requests, completed_requests, failed_requests, metadata, execution_mode')
            .or(`provider_batch_id.eq.${batchIdentifier},openai_batch_id.eq.${batchIdentifier}`)
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST204') {
            return { row: null, lookupError: error.message };
        }
        if (data) {
            const rowData = data as Record<string, unknown>;
            return {
                row: {
                    id: String(rowData.id),
                    provider: normalizeBatchProvider(rowData.provider),
                    execution_mode: rowData.execution_mode as string | null | undefined,
                    provider_batch_id:
                        typeof rowData.provider_batch_id === 'string'
                            ? rowData.provider_batch_id
                            : typeof rowData.openai_batch_id === 'string'
                                ? rowData.openai_batch_id
                                : null,
                    total_requests:
                        typeof rowData.total_requests === 'number' ? rowData.total_requests : null,
                    completed_requests:
                        typeof rowData.completed_requests === 'number' ? rowData.completed_requests : null,
                    failed_requests:
                        typeof rowData.failed_requests === 'number' ? rowData.failed_requests : null,
                    metadata: parseBatchMetadata(rowData.metadata),
                },
                lookupError: null,
            };
        }
    }

    // 2. Try to find by primary key if it IS a UUID
    if (isUuid(batchIdentifier)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('id, provider, provider_batch_id, openai_batch_id, total_requests, completed_requests, failed_requests, metadata, execution_mode')
            .eq('id', batchIdentifier)
            .limit(1)
            .maybeSingle();

        if (error) {
            return { row: null, lookupError: error.message };
        }

        if (!data) {
            return { row: null, lookupError: null };
        }

        const rowData = data as Record<string, unknown>;
        return {
            row: {
                id: String(rowData.id),
                provider: normalizeBatchProvider(rowData.provider),
                execution_mode: rowData.execution_mode as string | null | undefined,
                provider_batch_id:
                    typeof rowData.provider_batch_id === 'string'
                        ? rowData.provider_batch_id
                        : typeof rowData.openai_batch_id === 'string'
                            ? rowData.openai_batch_id
                            : null,
                total_requests:
                    typeof rowData.total_requests === 'number' ? rowData.total_requests : null,
                completed_requests:
                    typeof rowData.completed_requests === 'number' ? rowData.completed_requests : null,
                failed_requests:
                    typeof rowData.failed_requests === 'number' ? rowData.failed_requests : null,
                metadata: parseBatchMetadata(rowData.metadata),
            },
            lookupError: null,
        };
    }

    return { row: null, lookupError: null };
}

async function resolveProviderBatchId(batchIdentifier: string): Promise<{
    provider: string;
    providerBatchId: string;
}> {
    if (!isUuid(batchIdentifier)) {
        const { row } = await findBatchJobRow(batchIdentifier);
        return {
            provider: row?.provider ?? 'deepseek',
            providerBatchId: row?.provider_batch_id ?? batchIdentifier,
        };
    }

    const { row } = await findBatchJobRow(batchIdentifier);
    if (!row) {
        return {
            provider: 'deepseek',
            providerBatchId: batchIdentifier,
        };
    }

    return {
        provider: row.provider,
        providerBatchId: row.provider_batch_id ?? batchIdentifier,
    };
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

// The function parseStructuredConsolidationText has been moved to result-parsing.ts
// and is imported at the top of this file.

type SourceTrustLevel = 'canonical' | 'trusted' | 'standard' | 'marketplace';
type AnimalSignal = 'dog' | 'cat' | 'horse' | 'bird' | 'small-pet';

const MARKETPLACE_SOURCE_FRAGMENTS = ['amazon', 'ebay', 'etsy', 'walmart', 'marketplace', 'seller', 'ai_search', 'shop'];
const TRUSTED_SOURCE_FRAGMENTS = [
    'vlm_ocr',
    'vlm-ocr',
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
    'official_brand',
    'official-brand',
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
    upc: string;
    next_fields: Record<string, unknown>;
    pipeline_status: PipelineStatus;
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

function getPromptEvidenceSortRank(sourceName: string, trust: SourceTrustLevel): number {
    if (trust === 'canonical') {
        return 0;
    }

    if (sourceName.toLowerCase().includes('manufacturer')) {
        return 1;
    }

    switch (trust) {
        case 'trusted':
            return 2;
        case 'standard':
            return 3;
        case 'marketplace':
            return 4;
        default:
            return 5;
    }
}


function buildPromptSourceEvidence(filteredSources: Record<string, unknown>): PromptSourceEvidence[] {
    const sourceEvidence = Object.entries(filteredSources)
        .filter(([, data]) => data && typeof data === 'object' && !Array.isArray(data))
        .map(([source, data]) => ({
            source,
            trust: getSourceTrustLevel(source),
            fields: data as Record<string, unknown>,
        }))
        .sort((left, right) => {
            const trustComparison =
                getPromptEvidenceSortRank(left.source, left.trust)
                - getPromptEvidenceSortRank(right.source, right.trust);
            if (trustComparison !== 0) {
                return trustComparison;
            }

            const fieldComparison = Object.keys(right.fields).length - Object.keys(left.fields).length;
            if (fieldComparison !== 0) {
                return fieldComparison;
            }

            return left.source.localeCompare(right.source);
        });

    return sourceEvidence.slice(0, MAX_PROMPT_SOURCES);
}



/**
 * Create a JSONL batch file content for product consolidation.
 */
export function createBatchContent(
    products: ProductSource[],
    systemPrompt: string,
    responseSchema?: object,
    config?: {
        provider?: BatchProviderKey;
        model: string;
        maxTokens: number;
        temperature: number;
    }
): string {
    const lines: string[] = [];

    const model = config?.model || CONSOLIDATION_CONFIG.model;
    const maxTokens = config?.maxTokens || CONSOLIDATION_CONFIG.maxTokens;
    const temperature = config?.temperature || CONSOLIDATION_CONFIG.temperature;
    const jsonResponseFormat = buildJSONResponseFormat();

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
        const userPrompt = buildUserPrompt(product, sourceEvidence);

        const request = {
            custom_id: product.upc,
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
                response_format: jsonResponseFormat,
            },
        };

        lines.push(JSON.stringify(request));
    }

    return lines.join('\n');
}

async function getConfiguredBatchRuntime(
    options?: {
        routingKey?: string;
    }
): Promise<ConsolidationRuntimeConfig | BatchErrorResponse> {
    const config = await getConsolidationConfig(options);

    if (!config.llm_api_key) {
        return { success: false, error: 'LLM API key not configured' };
    }

    return config;
}

function isRuntimeErrorResponse(
    value: ConsolidationRuntimeConfig | BatchErrorResponse
): value is BatchErrorResponse {
    return 'success' in value;
}

function isSubmitBatchResponse(
    value: SubmitBatchResponse | BatchErrorResponse
): value is SubmitBatchResponse {
    return value.success === true;
}

// =============================================================================
// Batch Submission
// =============================================================================

function groupProductsByProductLine(products: ProductSource[]): Map<string, ProductSource[]> {
    const groups = new Map<string, ProductSource[]>();

    for (const product of products) {
        const productLine = product.productLineContext?.productLine;
        const key = productLine && typeof productLine === 'string' && productLine.trim().length > 0
            ? productLine.trim()
            : '__no_product_line__';

        const existing = groups.get(key);
        if (existing) {
            existing.push(product);
        } else {
            groups.set(key, [product]);
        }
    }

    return groups;
}

async function submitBatchByProductLine(
    products: ProductSource[],
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    const groups = groupProductsByProductLine(products);

    if (groups.size === 1) {
        return submitBatch(products, metadata);
    }

    const results: SubmitBatchResponse[] = [];
    const errors: string[] = [];

    for (const [productLine, lineProducts] of groups) {
        const lineMetadata: BatchMetadata = {
            ...metadata,
            product_line: productLine === '__no_product_line__' ? undefined : productLine,
            description: metadata.description
                ? `${metadata.description} [${productLine === '__no_product_line__' ? 'no product line' : productLine}]`
                : `Consolidation batch for ${lineProducts.length} products${productLine === '__no_product_line__' ? '' : ` (${productLine})`}`,
        };

        const result = await submitBatch(lineProducts, lineMetadata);
        if (isSubmitBatchResponse(result)) {
            results.push(result);
        } else {
            errors.push(`${productLine}: ${result.error}`);
        }
    }

    if (errors.length > 0 && results.length === 0) {
        return { success: false, error: `All batch submissions failed: ${errors.join('; ')}` };
    }

    const primaryResult = results[0];
    const totalProducts = results.reduce((sum, r) => sum + r.product_count, 0);

    return {
        success: true,
        batch_id: primaryResult.batch_id,
        provider: primaryResult.provider,
        provider_batch_id: primaryResult.provider_batch_id,
        product_count: totalProducts,
        _batch_groups: results.map((r) => ({
            batch_id: r.batch_id,
            product_count: r.product_count,
        })),
        _error_count: errors.length,
    };
}


/**
 * Submit a batch job to the configured provider and track it in Supabase.
 */
async function submitDirectChatBatchToRuntime(
    products: ProductSource[],
    metadata: BatchMetadata,
    config: ConsolidationRuntimeConfig,
    routingKey: string,
    preflightModelsList: string[]
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    const { systemPrompt, categories = [] } = await buildPromptContext();
    const responseSchema = buildResponseSchema(categories);

    const content = createBatchContent(products, systemPrompt, responseSchema, {
        provider: 'deepseek',
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
    });

    const stringMetadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
            stringMetadata[key] = value;
        }
    }
    stringMetadata.llm_provider = 'deepseek';
    stringMetadata.llm_model = config.model;
    stringMetadata.routing_key = routingKey;
    stringMetadata.preflight_models = preflightModelsList;

    return createDirectChatBatch(
        products,
        stringMetadata,
        config,
        content,
        systemPrompt
    );
}

/**
 * Submit a batch job — routes to the appropriate provider service.
 * - Gemini → creates local gemini_batch job (async, returns immediately)
 * - DeepSeek → creates direct_chat_chunks job with preflight
 */
export async function submitBatch(
    products: ProductSource[],
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    try {
        const routingKey = buildBatchRoutingKey(products, metadata);
        const runtime = await getConfiguredBatchRuntime({ routingKey });
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        // Route Gemini batches to the async gemini-batch service
        if (runtime.provider === 'gemini') {
            const geminiApiKey = runtime.gemini_api_key || runtime.llm_api_key;
            if (!geminiApiKey) {
                return { success: false, error: 'Gemini API key not configured' };
            }

            // Create local batch job (no provider calls, returns immediately)
            const geminiResult = await createGeminiBatchJob(
                products,
                runtime.model,
                geminiApiKey,
                {
                    ...metadata,
                    routing_key: routingKey,
                    llm_provider: 'gemini',
                    llm_model: runtime.model,
                }
            );

            return geminiResult;
        }

        // DeepSeek/OpenAI-compatible path with preflight
        const preflight = await preflightModels(runtime);
        if (!preflight.success) {
            return {
                success: false,
                error: preflight.error,
            };
        }

        const directChatResult = await submitDirectChatBatchToRuntime(
            products,
            metadata,
            runtime,
            routingKey,
            preflight.models.map((model) => model.id)
        );

        return directChatResult;
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to submit batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit batch',
        };
    }
}

// =============================================================================
// Classification Batch Submission
// =============================================================================

/**
 * Submit a product line classification batch.
 * Creates a batch_jobs row with execution_mode='product_line_classification'
 * and one batch_job_items row per UPC.
 */
export async function submitProductLineClassificationBatch(
    products: Array<{ upc: string; sources: Record<string, unknown>; input?: Record<string, unknown> | null }>,
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (products.length === 0) {
        return { success: false, error: 'No products to classify' };
    }

    try {
        const supabase = await createAdminClient();
        const runtime = await getConfiguredBatchRuntime();
        if (isRuntimeErrorResponse(runtime)) return runtime;

        const batchId = crypto.randomUUID();
        const providerBatchId = `classify_${crypto.randomUUID()}`;
        const model = runtime.model;

        // Extract evidence for all products to find brand context and siblings
        const productEvidences = products.map(p => ({
            upc: p.upc,
            evidence: extractClassificationEvidence(p.upc, p.sources, p.input),
            sources: p.sources,
            input: p.input,
        }));

        // Get unique brand names (non-empty)
        const brandNames = Array.from(
            new Set(
                productEvidences
                    .map(pe => pe.evidence.brand?.trim())
                    .filter((b): b is string => !!b)
            )
        );

        // Resolve brand IDs
        const brandNameToId = new Map<string, string>();
        const brandIds: string[] = [];
        if (brandNames.length > 0) {
            const { data: brandRows } = await supabase
                .from('brands')
                .select('id, name')
                .in('name', brandNames);
            if (brandRows) {
                for (const r of brandRows) {
                    brandNameToId.set(r.name, r.id);
                    brandIds.push(r.id);
                }
            }
        }

        // Load known product lines for these brands
        const knownProductLines = await loadKnownProductLines(brandIds);

        // Build a general system prompt for metadata
        const generalSystemPrompt = buildClassificationSystemPrompt(
            knownProductLines.map(pl => ({ id: pl.id, canonical_name: pl.canonical_name }))
        );

        // Group products by brand name for sibling lookup
        const productsByBrand = new Map<string, Array<{ upc: string; name: string }>>();
        for (const pe of productEvidences) {
            const bName = pe.evidence.brand?.trim().toLowerCase() || '__no_brand__';
            const list = productsByBrand.get(bName) || [];
            list.push({ upc: pe.upc, name: pe.evidence.name || pe.upc });
            productsByBrand.set(bName, list);
        }

        // Insert batch_jobs parent row
        const { error: insertError } = await supabase.from('batch_jobs').insert({
            id: batchId,
            provider: runtime.provider,
            provider_batch_id: providerBatchId,
            status: 'pending',
            execution_mode: 'product_line_classification',
            description: (metadata.description as string) || `Product line classification for ${products.length} products`,
            auto_apply: false,
            total_requests: products.length,
            completed_requests: 0,
            failed_requests: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            estimated_cost: 0,
            metadata: {
                ...metadata,
                system_prompt: generalSystemPrompt,
                llm_model: model,
                llm_base_url: runtime.llm_base_url,
                known_product_lines_count: knownProductLines.length,
            },
        });

        if (insertError) {
            console.error('[Classification] Failed to insert batch job:', insertError);
            return { success: false, error: insertError.message };
        }

        // Insert one batch_job_items row per product with dynamic system prompts and sibling user prompts
        const items = productEvidences.map(pe => {
            const bName = pe.evidence.brand?.trim();
            const bId = bName ? brandNameToId.get(bName) : undefined;

            // Filter known product lines to this brand (or null brand)
            const brandLines = knownProductLines.filter(
                pl => pl.brand_id === null || (bId && pl.brand_id === bId)
            );

            const systemPrompt = buildClassificationSystemPrompt(
                brandLines.map(pl => ({ id: pl.id, canonical_name: pl.canonical_name }))
            );

            // Find siblings of the same brand in this batch (excluding self)
            const bKey = pe.evidence.brand?.trim().toLowerCase() || '__no_brand__';
            const siblings = (productsByBrand.get(bKey) || []).filter(sib => sib.upc !== pe.upc);

            const userPrompt = buildClassificationUserPrompt(pe.evidence, siblings);

            return {
                batch_job_id: batchId,
                upc: pe.upc,
                status: 'pending' as const,
                item_kind: 'upc' as const,
                subject_key: pe.upc,
                request_payload: {
                    model,
                    messages: [
                        { role: 'system' as const, content: systemPrompt },
                        { role: 'user' as const, content: userPrompt },
                    ],
                    max_tokens: 512,
                    temperature: 0.1,
                    response_format: { type: 'json_object' as const },
                },
                product_source: pe.sources,
            };
        });

        const { error: itemsError } = await supabase.from('batch_job_items').insert(items);
        if (itemsError) {
            await supabase.from('batch_jobs').delete().eq('id', batchId);
            return { success: false, error: itemsError.message };
        }

        console.log('[Classification] Created batch %s with %d items', batchId, items.length);

        return {
            success: true,
            batch_id: batchId,
            provider: runtime.provider,
            provider_batch_id: providerBatchId,
            product_count: products.length,
            execution_mode: 'product_line_classification',
        };
    } catch (error) {
        console.error('[Classification] Failed to submit batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit classification batch',
        };
    }
}

// =============================================================================
// Group Consolidation Submission
// =============================================================================

/**
 * Submit a group consolidation batch.
 * Creates one batch_job_items row per Product Group (not per UPC).
 * Each group item contains all UPC source evidence for a single multi-product LLM call.
 */
export async function submitGroupConsolidationBatch(
    groups: Array<{ product_line_id: string; product_line_name: string; upcs: string[] }>,
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (groups.length === 0) {
        return { success: false, error: 'No groups to consolidate' };
    }

    const totalProducts = groups.reduce((sum, g) => sum + g.upcs.length, 0);

    try {
        const supabase = await createAdminClient();
        const runtime = await getConfiguredBatchRuntime();
        if (isRuntimeErrorResponse(runtime)) return runtime;

        const batchId = crypto.randomUUID();
        const providerBatchId = `group_${crypto.randomUUID()}`;
        const model = runtime.model;

        // Build prompt context (shared categories for all groups)
        const { categories = [] } = await buildPromptContext();

        // Insert batch_jobs parent row
        const { error: insertError } = await supabase.from('batch_jobs').insert({
            id: batchId,
            provider: runtime.provider,
            provider_batch_id: providerBatchId,
            status: 'pending',
            execution_mode: 'direct_chat_chunks',
            description: (metadata.description as string) || `Group consolidation for ${groups.length} groups (${totalProducts} products)`,
            auto_apply: !!metadata.auto_apply,
            total_requests: groups.length,
            completed_requests: 0,
            failed_requests: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            estimated_cost: 0,
            metadata: {
                ...metadata,
                group_count: groups.length,
                product_count: totalProducts,
                is_group_consolidation: true,
                group_label: groups.length === 1
                    ? groups[0].product_line_name
                    : `${totalProducts} products (${groups.length} groups)`,
                llm_model: model,
                llm_base_url: runtime.llm_base_url,
            },
        });

        if (insertError) {
            console.error('[GroupConsolidation] Failed to insert batch job:', insertError);
            return { success: false, error: insertError.message };
        }

        // Load all products' source data
        const allUpcs = groups.flatMap(g => g.upcs);
        const { data: products } = await supabase
            .from('products_ingestion')
            .select('upc, sources, input')
            .in('upc', allUpcs);

        if (!products || products.length === 0) {
            await supabase.from('batch_jobs').delete().eq('id', batchId);
            return { success: false, error: 'No products found for provided UPCs' };
        }

        const productsByUpc = new Map(
            (products as Array<{ upc: string; sources: Record<string, unknown>; input: Record<string, unknown> | null }>).map(p => [p.upc, p])
        );

        // Build source evidence for each product and create one batch_job_items row per group
        const items = groups.map(group => {
            const groupProducts = group.upcs
                .map(upc => productsByUpc.get(upc))
                .filter((p): p is NonNullable<typeof p> => Boolean(p));

            // Build source evidence for each product in the group
            const productEvidence = groupProducts.map(p => {
                const normalizedSources = buildConsolidationSourcesPayload(p.sources, p.input);
                const sourceEntries = Object.entries(normalizedSources);
                const filteredSources: Record<string, unknown> = {};

                for (const [sourceName, sourceData] of sourceEntries) {
                    if (sourceData && typeof sourceData === 'object') {
                        const sd = sourceData as Record<string, unknown>;
                        const filtered: Record<string, unknown> = {};
                        for (const [key, val] of Object.entries(sd)) {
                            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                                filtered[key] = val;
                            }
                        }
                        if (Object.keys(filtered).length > 0) {
                            filteredSources[sourceName] = filtered;
                        }
                    }
                }

                const sources = Object.keys(filteredSources).map(sourceName => ({
                    source: sourceName,
                    trust: sourceName === 'shopsite_input' ? 'canonical' as const :
                           /vlm_ocr|vlm-ocr|bradley|central-pet|orgill|doitbest|manufacturer|distributor|official-brand|catalog/i.test(sourceName) ? 'trusted' as const :
                           /amazon|ebay|walmart|marketplace|seller/i.test(sourceName) ? 'marketplace' as const :
                           'standard' as const,
                    fields: filteredSources[sourceName] as Record<string, unknown>,
                }));

                return {
                    upc: p.upc,
                    sources,
                };
            });

            // Build system prompt for this group
            const systemPrompt = generateGroupConsolidationSystemPrompt(
                categories,
                group.product_line_name,
                group.upcs.length
            );

            // Build user prompt
            const userPrompt = buildGroupUserPromptPayload(productEvidence, group.product_line_name);

            return {
                batch_job_id: batchId,
                upc: null,
                status: 'pending' as const,
                item_kind: 'product_group' as const,
                subject_key: group.product_line_id,
                request_payload: {
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: runtime.maxTokens,
                    temperature: runtime.temperature,
                    response_format: { type: 'json_object' },
                },
                product_source: {
                    group_upcs: group.upcs,
                    product_line_id: group.product_line_id,
                    product_line_name: group.product_line_name,
                },
            };
        });

        const { error: itemsError } = await supabase.from('batch_job_items').insert(items as any);
        if (itemsError) {
            await supabase.from('batch_jobs').delete().eq('id', batchId);
            return { success: false, error: itemsError.message };
        }

        console.log('[GroupConsolidation] Created batch %s with %d groups (%d products)', batchId, groups.length, totalProducts);



        return {
            success: true,
            batch_id: batchId,
            provider: runtime.provider,
            provider_batch_id: providerBatchId,
            product_count: totalProducts,
        };
    } catch (error) {
        console.error('[GroupConsolidation] Failed to submit batch:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit group consolidation batch',
        };
    }
}

/**
 * Read-only status helper for direct_chat_chunks jobs.
 * Does NOT process items or call DeepSeek.
 */
async function getDirectChatStatusReadOnly(
    batchDbId: string
): Promise<BatchStatus | BatchErrorResponse> {
    try {
        return await getDirectChatStatusSnapshot(batchDbId);
    } catch (error: unknown) {
        console.error('[DirectChat] getDirectChatStatusReadOnly error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get direct chat batch status',
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
    try {
        // Read-only path: load from local DB, never call provider APIs
        const supabase = await createAdminClient();

        // Try to load batch_jobs row directly
        const { data: rowData, error: rowError } = await supabase
            .from('batch_jobs')
            .select('*')
            .eq('id', batchId)
            .single();

        if (rowError || !rowData) {
            // Fallback: try finding by provider_batch_id or openai_batch_id
            const lookup = await findBatchJobRow(batchId);
            if (lookup.lookupError) {
                return { success: false, error: lookup.lookupError };
            }
            if (!lookup.row) {
                return { success: false, error: 'Batch job not found' };
            }

            const { data: foundRow } = await supabase
                .from('batch_jobs')
                .select('*')
                .eq('id', lookup.row.id)
                .single();

            if (!foundRow) {
                return { success: false, error: 'Batch job data not found' };
            }

            // Use the found row for status
            return buildBatchJobStatusFromRow(foundRow as Record<string, unknown>);
        }

        const executionMode = (rowData as Record<string, unknown>).execution_mode as string;

        // Use the direct-chat read-only snapshot if applicable
        if (executionMode === 'direct_chat_chunks') {
            return await getDirectChatStatusSnapshot(batchId);
        }

        // Classification batches use direct-chat processing, same read-only path
        if (executionMode === 'product_line_classification') {
            return await getDirectChatStatusSnapshot(batchId);
        }

        // For Gemini batch jobs, sync with provider if the job is still active
        if (executionMode === 'gemini_batch') {
            const statusFromDb = buildGeminiBatchStatus(rowData as Record<string, unknown>);

            // If the batch is still in progress (not terminal), poll the provider
            if (statusFromDb.is_processing || statusFromDb.status === 'pending') {
                try {
                    const geminiKey = await getAIScrapingProviderSecret('gemini');
                    if (geminiKey) {
                        // Advance pre-provider jobs: if no provider_batch_id, run prep/submit
                        // before calling syncGeminiBatchStatus. This ensures explicit status
                        // refresh (e.g. from /api/admin/consolidation/{batchId}) progresses
                        // newly queued Gemini jobs the same way that /sync does.
                        const hasProviderBatch = !!(rowData as Record<string, unknown>).provider_batch_id;
                        if (!hasProviderBatch) {
                            const geminiMetadata = (rowData as Record<string, unknown>).metadata as Record<string, unknown> || {};
                            const geminiStage = geminiMetadata.gemini_stage as string || 'preparing';
                            if (geminiStage === 'preparing') {
                                await prepareGeminiBatchChunk(batchId, { limit: 5, geminiApiKey: geminiKey });
                            }
                            // Check if ready to submit
                            const { data: refreshedPrepItems } = await supabase
                                .from('batch_job_items')
                                .select('status')
                                .eq('batch_job_id', batchId);
                            const pending = (refreshedPrepItems || []).filter(i => i.status === 'pending').length;
                            if (pending === 0) {
                                await submitPreparedGeminiBatch(batchId, geminiKey);
                            }
                        }

                        const syncResult = await syncGeminiBatchStatus(batchId, geminiKey);
                        // Return fresh status after sync
                        const { data: refreshedRow } = await supabase
                            .from('batch_jobs')
                            .select('*')
                            .eq('id', batchId)
                            .single();
                        if (refreshedRow) {
                            return buildGeminiBatchStatus(refreshedRow as Record<string, unknown>);
                        }
                    }
                } catch (err) {
                    console.warn('[Consolidation] Failed to sync Gemini batch status:', err);
                    // Return DB status as fallback
                }
            }

            return statusFromDb;
        }

        // Legacy/historical jobs: build status from stored DB row counts
        return buildBatchJobStatusFromRow(rowData as Record<string, unknown>);
    } catch (error: unknown) {
        console.error('[Consolidation] Failed to get batch status:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get batch status',
        };
    }
}

/**
 * Build a BatchStatus from a batch_jobs row without calling any provider API.
 */
function buildBatchJobStatusFromRow(row: Record<string, unknown>): BatchStatus {
    const totalRequests = Number(row.total_requests) || 0;
    const completedRequests = Number(row.completed_requests) || 0;
    const failedRequests = Number(row.failed_requests) || 0;
    const totalTerminal = completedRequests + failedRequests;
    const statusValue = String(row.status || 'pending');

    return {
        id: String(row.id),
        provider: (row.provider as BatchStatus['provider']) || 'deepseek',
        provider_batch_id: String(row.provider_batch_id || row.openai_batch_id || ''),
        status: statusValue as BatchStatus['status'],
        is_complete: ['completed', 'failed', 'expired', 'cancelled'].includes(statusValue),
        is_failed: ['failed', 'expired', 'cancelled'].includes(statusValue),
        is_processing: ['validating', 'in_progress', 'pending', 'finalizing'].includes(statusValue),
        total_requests: totalRequests,
        completed_requests: completedRequests,
        failed_requests: failedRequests,
        progress_percent: totalRequests > 0 ? Math.round((totalTerminal / totalRequests) * 100) : 0,
        prompt_tokens: Number(row.prompt_tokens) || undefined,
        completion_tokens: Number(row.completion_tokens) || undefined,
        total_tokens: Number(row.total_tokens) || undefined,
        created_at: row.created_at ? new Date(String(row.created_at)).getTime() / 1000 : undefined,
        completed_at: row.completed_at ? new Date(String(row.completed_at)).getTime() / 1000 : null,
        metadata: (row.metadata as BatchMetadata) || {},
    };
}

// =============================================================================
// Explicit Queue Processing
// =============================================================================

export interface ProcessBatchQueueResult {
    processed: number;
    completed: number;
    failed: number;
    batch_id: string;
    status: BatchStatus;
}

/**
 * Explicitly process pending items in a direct-chat consolidation job.
 * This is the only mutating path — it calls DeepSeek and persists results.
 */
export async function processBatchQueue(
    batchId: string,
    options?: { limit?: number; timeoutMs?: number }
): Promise<ProcessBatchQueueResult | BatchErrorResponse> {
    try {
        const supabase = await createAdminClient();

        // Resolve the batch job ID
        let jobId = batchId;
        const { data: rowData } = await supabase
            .from('batch_jobs')
            .select('id, execution_mode')
            .eq('id', batchId)
            .maybeSingle();

        if (!rowData) {
            // Try finding by provider_batch_id or openai_batch_id
            const lookup = await findBatchJobRow(batchId);
            if (lookup.lookupError || !lookup.row) {
                return { success: false, error: lookup.lookupError || 'Batch job not found' };
            }
            jobId = lookup.row.id;
        }

        // Verify execution mode
        let executionMode: string | null | undefined;
        if (rowData) {
            executionMode = (rowData as Record<string, unknown>).execution_mode as string;
        } else {
            const { data: fullRow } = await supabase
                .from('batch_jobs')
                .select('execution_mode')
                .eq('id', jobId)
                .single();
            executionMode = fullRow?.execution_mode;
        }

        const isDirectChat = executionMode === 'direct_chat_chunks' || executionMode === 'product_line_classification';
        if (!isDirectChat) {
            return { success: false, error: 'Only direct-chat and classification jobs support explicit queue processing' };
        }

        // Process chunk
        const chunkResult = await processDirectChatChunk(jobId, { limit: options?.limit, timeoutMs: options?.timeoutMs });

        // Persist aggregate status
        const aggregateResult = await aggregateDirectChatStatus(jobId);
        if ('success' in aggregateResult && !aggregateResult.success) {
            return { success: false, error: aggregateResult.error };
        }

        return {
            processed: chunkResult.processed,
            completed: chunkResult.completed,
            failed: chunkResult.failed,
            batch_id: jobId,
            status: aggregateResult as BatchStatus,
        };
    } catch (error: unknown) {
        console.error('[Consolidation] processBatchQueue error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to process batch queue',
        };
    }
}

/**
 * Legacy alias: processBatchQueue for the /api/admin/consolidation/sync route.
 * Processes a chunk across all active direct-chat jobs.
 */
export async function processAllQueues(options?: { limit?: number }): Promise<{
    processed_job_count: number;
    processed_item_count: number;
    completed_item_count: number;
    failed_item_count: number;
    errors: string[];
}> {
    const supabase = await createAdminClient();
    const limit = options?.limit ?? 5;
    const errors: string[] = [];
    let processedJobCount = 0;
    let processedItemCount = 0;
    let completedItemCount = 0;
    let failedItemCount = 0;

    // Find active direct-chat jobs
    const { data: activeJobs } = await supabase
        .from('batch_jobs')
        .select('id')
        .in('execution_mode', ['direct_chat_chunks', 'product_line_classification'])
        .in('status', ['pending', 'in_progress']);

    if (activeJobs && activeJobs.length > 0) {
        for (const job of activeJobs) {
            try {
                const result = await processBatchQueue(job.id, { limit });
                if ('success' in result) {
                    errors.push(`${job.id}: ${result.error}`);
                } else {
                    processedJobCount++;
                    processedItemCount += result.processed;
                    completedItemCount += result.completed;
                    failedItemCount += result.failed;
                }
            } catch (err) {
                errors.push(`${job.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }
    }

    // Process Gemini batch prep/poll
    try {
        const { data: geminiJobs } = await supabase
            .from('batch_jobs')
            .select('id, status, metadata')
            .eq('execution_mode', 'gemini_batch')
            .in('status', ['pending', 'in_progress'])
            .limit(3);

        if (geminiJobs && geminiJobs.length > 0) {
            // Resolve Gemini API key from stored credentials, not from current consolidation defaults.
            // This ensures existing Gemini jobs still sync even after the admin switches the
            // consolidation default provider (e.g., from Gemini back to DeepSeek).
            const geminiApiKey = await getAIScrapingProviderSecret('gemini') || '';

            if (geminiApiKey) {
                for (const geminiJob of geminiJobs) {
                    try {
                        const geminiMetadata = (geminiJob.metadata as Record<string, unknown>) || {};
                        const stage = geminiMetadata.gemini_stage as string || 'preparing';

                        if (stage === 'preparing' || geminiJob.status === 'pending') {
                            const prepResult = await prepareGeminiBatchChunk(geminiJob.id, {
                                limit: 5,
                                geminiApiKey,
                            });
                            processedItemCount += prepResult.prepared;
                            errors.push(...prepResult.errors.map((e) => `gemini-${geminiJob.id}: ${e}`));

                            if (prepResult.ready_to_submit) {
                                const submitResult = await submitPreparedGeminiBatch(geminiJob.id, geminiApiKey);
                                if (submitResult.success) {
                                    processedJobCount++;
                                } else {
                                    errors.push(`gemini-submit-${geminiJob.id}: ${submitResult.error || 'unknown'}`);
                                }
                            }
                        } else if (['in_progress', 'finalizing'].includes(stage)) {
                            const syncResult = await syncGeminiBatchStatus(geminiJob.id, geminiApiKey);
                            if (syncResult.is_complete) {
                                completedItemCount += syncResult.items_updated;
                            }
                            if (syncResult.error && !syncResult.is_complete) {
                                errors.push(`gemini-sync-${geminiJob.id}: ${syncResult.error}`);
                            }
                        }
                    } catch (err) {
                        errors.push(`gemini-${geminiJob.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                }
            }
        }
    } catch (err) {
        errors.push(`gemini-batch: ${err instanceof Error ? err.message : 'Failed to process Gemini batches'}`);
    }

    return {
        processed_job_count: processedJobCount,
        processed_item_count: processedItemCount,
        completed_item_count: completedItemCount,
        failed_item_count: failedItemCount,
        errors,
    };
}

// =============================================================================
// Result Retrieval
// =============================================================================

/**
 * Retrieve and parse results from a completed batch.
 */
export async function retrieveResults(batchId: string): Promise<ConsolidationResult[] | BatchErrorResponse> {
    try {
        // Check if this is a direct-chat batch (synthetic IDs start with 'local_' or 'direct_',
        // or execution_mode is 'direct_chat_chunks')
        const { row: lookupRow } = await findBatchJobRow(batchId);

        const isDirectChat = lookupRow && (
            lookupRow.execution_mode === 'direct_chat_chunks' ||
            lookupRow.provider_batch_id?.startsWith('local_') ||
            lookupRow.provider_batch_id?.startsWith('direct_')
        );

        if (isDirectChat) {
            // Get direct chat results
            const directResults = await retrieveDirectChatResults(batchId);

            // Check for fallback batch results
            const parentMetadata = lookupRow.metadata || {};
            const fallbackBatchId = parentMetadata.direct_chat_fallback_batch_id as string | undefined;

            if (fallbackBatchId) {
                const fallbackResults = await retrieveResults(fallbackBatchId);
                if (Array.isArray(fallbackResults)) {
                    const directUpcs = new Set(directResults.map((r: ConsolidationResult) => r.upc));
                    for (const fbResult of fallbackResults) {
                        if (!directUpcs.has(fbResult.upc)) {
                            directResults.push(fbResult);
                        }
                    }
                }
            }

            return directResults.length > 0 ? directResults : { success: false, error: 'No results found' };
        }

        // Route Gemini batch results
        if (lookupRow && lookupRow.execution_mode === 'gemini_batch') {
            return await retrieveGeminiBatchResults(batchId);
        }

        // Fetch taxonomy for validation
        const { categories = [] } = await buildPromptContext();
        const resolved = await resolveProviderBatchId(batchId);
        const runtime = await getConfiguredBatchRuntime();
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        const results: ConsolidationResult[] = [];

        const client = await getOpenAIClient();
        if (!client) {
            return { success: false, error: 'LLM provider not configured' };
        }

        const batch = await client.batches.retrieve(resolved.providerBatchId);

        if (!['completed', 'failed', 'cancelled'].includes(batch.status)) {
            return { success: false, error: `Batch not complete. Status: ${batch.status}` };
        }

        // Process Output File (Successes)
        if (batch.output_file_id) {
            try {
                const fileContent = await client.files.content(batch.output_file_id);
                const text = await fileContent.text();

                for (const line of text.trim().split('\n')) {
                    if (!line) continue;
                    let upc = 'unknown';
                    try {
                        const result = JSON.parse(line);
                        upc = result.custom_id || 'unknown';

                        if (result.error) {
                            results.push({ upc, error: result.error.message || 'Unknown error' });
                            continue;
                        }

                        const response = result.response || {};
                        if (response.status_code !== 200) {
                            results.push({ upc, error: `API error: ${response.status_code}` });
                            continue;
                        }

                        const body = response.body || {};
                        const choices = body.choices || [];
                        if (choices.length === 0) {
                            results.push({ upc, error: 'No choices in response' });
                            continue;
                        }

                        const content = choices[0]?.message?.content || '';
                        results.push(
                            parseStructuredConsolidationText(
                                upc,
                                content,
                                categories
                            )
                        );
                    } catch (e) {
                        results.push({
                            upc,
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
                        const upc = errorRecord.custom_id || 'unknown';
                        const errMsg = errorRecord.error?.message || JSON.stringify(errorRecord);
                        results.push({ upc, error: `Batch Error: ${errMsg}` });
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
// Group Consolidation Results Retrieval
// =============================================================================

/**
 * Retrieve and flatten group consolidation results.
 * Group items store parsed results as { type: 'group_consolidation', results: ConsolidationResult[] }.
 * This extracts and returns the flat per-UPC results.
 */
export async function retrieveGroupConsolidationResults(
    batchId: string
): Promise<ConsolidationResult[] | BatchErrorResponse> {
    try {
        const supabase = await createAdminClient();

        const { data: items } = await supabase
            .from('batch_job_items')
            .select('*')
            .eq('batch_job_id', batchId);

        if (!items || items.length === 0) {
            return { success: false, error: 'No items found in batch' };
        }

        const results: ConsolidationResult[] = [];

        for (const item of items as Array<Record<string, unknown>>) {
            const itemKind = (item.item_kind as string) || 'upc';
            const parsedResult = item.parsed_result as Record<string, unknown> | null;

            if (item.status === 'completed' && parsedResult) {
                // Group result: extract flattened per-UPC results
                if ((itemKind === 'product_group' || itemKind === 'subproduct_group') &&
                    parsedResult.type === 'group_consolidation' &&
                    Array.isArray(parsedResult.results)) {
                    results.push(...(parsedResult.results as ConsolidationResult[]));
                } else {
                    // Legacy per-UPC or classification result
                    const upc = (item.upc as string) || (parsedResult.upc as string) || 'unknown';
                    results.push(parsedResult as unknown as ConsolidationResult);
                }
            } else if (item.status === 'failed') {
                // Group failure: mark all UPCs in the group as failed
                if (itemKind === 'product_group' || itemKind === 'subproduct_group') {
                    const productSource = item.product_source as Record<string, unknown> || {};
                    const groupUpcs = productSource.group_upcs as string[] || [];
                    for (const upc of groupUpcs) {
                        results.push({
                            upc,
                            error: (item.error_message as string) || 'Group consolidation failed',
                        });
                    }
                } else {
                    results.push({
                        upc: (item.upc as string) || 'unknown',
                        error: (item.error_message as string) || 'Unknown error',
                    });
                }
            }
        }

        if (results.length === 0) {
            return { success: false, error: 'No results found in batch' };
        }

        return results;
    } catch (error: unknown) {
        console.error('[GroupConsolidation] Failed to retrieve group results:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to retrieve group consolidation results',
        };
    }
}

// =============================================================================
// Apply Results
// =============================================================================

const LEGACY_TO_CANONICAL_FACETS: Record<string, string> = {
    pet_type: 'animal_type',
    life_stage: 'life_stage',
    pet_size: 'breed_size',
    special_diet: 'diet_type',
    health_feature: 'health_focus',
    food_form: 'food_form',
    flavor: 'flavor',
    product_feature: 'claims',
    size: 'size',
    color: 'color',
    packaging_type: 'packaging_type',
};

function normalizeConsolidatedRecord(record: any): any {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return { core: {}, facets: [], media: [], evidence: {} };
    }
    if ('core' in record) {
        return record;
    }
    return {
        core: {
            name: record.name,
            brand_name: record.brand_name || record.brand,
            brand_id: record.brand_id,
            description: record.description,
            price: record.price,
            weight_lbs: typeof record.weight === 'string' ? parseFloat(record.weight) || undefined : (typeof record.weight_lbs === 'number' ? record.weight_lbs : undefined),
            canonical_category_breadcrumb: record.canonical_category_breadcrumb || record.category,
            search_keywords: record.search_keywords,
            confidence_score: record.confidence_score,
            facet_profile: record.facet_profile,
            stock_status: record.stock_status,
            availability: record.availability,
            minimum_quantity: record.minimum_quantity,
            is_special_order: record.is_special_order,
            is_taxable: record.is_taxable,
            gtin: record.gtin,
        },
        facets: [],
        media: Array.isArray(record.images) ? record.images.map((url: string, idx: number) => ({
            url,
            role: idx === 0 ? 'main' : 'gallery',
            source: 'scraped',
            confidence_score: 1.0,
        })) : [],
        evidence: {
            selected_images: Array.isArray(record.images) ? record.images : [],
        }
    };
}

function mergeNestedCandidates(current: any, next: any): any {
    const normCurrent = normalizeConsolidatedRecord(current);
    const normNext = normalizeConsolidatedRecord(next);

    const mergedCore = {
        ...(normCurrent.core || {}),
        ...(normNext.core || {}),
    };

    // Prune excluded fields from merged core
    for (const key of EXCLUDED_FROM_CONSOLIDATED_MERGE) {
        delete (mergedCore as any)[key];
    }

    const facetMap = new Map<string, any>();
    const currentFacets = Array.isArray(normCurrent.facets) ? normCurrent.facets : [];
    const nextFacets = Array.isArray(normNext.facets) ? normNext.facets : [];
    
    for (const f of currentFacets) {
        if (f.definition_slug) {
            facetMap.set(f.definition_slug, f);
        }
    }
    for (const f of nextFacets) {
        if (f.definition_slug) {
            facetMap.set(f.definition_slug, f);
        }
    }
    const mergedFacets = Array.from(facetMap.values());

    const mediaMap = new Map<string, any>();
    const currentMedia = Array.isArray(normCurrent.media) ? normCurrent.media : [];
    const nextMedia = Array.isArray(normNext.media) ? normNext.media : [];
    
    for (const m of currentMedia) {
        if (m.url) {
            mediaMap.set(m.url, m);
        }
    }
    for (const m of nextMedia) {
        if (m.url) {
            mediaMap.set(m.url, m);
        }
    }
    const mergedMedia = Array.from(mediaMap.values());

    const mergedEvidence = {
        ...(normCurrent.evidence || {}),
        ...(normNext.evidence || {}),
    };

    return {
        core: mergedCore,
        facets: mergedFacets,
        media: mergedMedia,
        evidence: mergedEvidence,
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
            const provider = normalizeBatchProvider(rowData.provider);
            const providerBatchId =
                typeof rowData.provider_batch_id === 'string' && rowData.provider_batch_id.length > 0
                    ? rowData.provider_batch_id
                    : typeof rowData.openai_batch_id === 'string' && rowData.openai_batch_id.length > 0
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
                provider,
                provider_batch_id: providerBatchId,
                provider_input_file_id:
                    typeof rowData.provider_input_file_id === 'string'
                        ? rowData.provider_input_file_id
                        : typeof rowData.input_file_id === 'string'
                            ? rowData.input_file_id
                            : null,
                provider_output_file_id:
                    typeof rowData.provider_output_file_id === 'string'
                        ? rowData.provider_output_file_id
                        : typeof rowData.output_file_id === 'string'
                            ? rowData.output_file_id
                            : null,
                provider_error_file_id:
                    typeof rowData.provider_error_file_id === 'string'
                        ? rowData.provider_error_file_id
                        : typeof rowData.error_file_id === 'string'
                            ? rowData.error_file_id
                            : null,
                openai_batch_id:
                    typeof rowData.openai_batch_id === 'string' ? rowData.openai_batch_id : null,
                id: providerBatchId || String(rowData.id),
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
    try {
        // Check if this is a direct-chat batch (synthetic IDs or execution_mode)
        const { row: lookupRow } = await findBatchJobRow(batchId);

        const isDirectChat = lookupRow && (
            lookupRow.execution_mode === 'direct_chat_chunks' ||
            lookupRow.provider_batch_id?.startsWith('local_') ||
            lookupRow.provider_batch_id?.startsWith('direct_')
        );

        if (isDirectChat) {
            const parentMetadata = lookupRow.metadata || {};
            const fallbackBatchId = parentMetadata.direct_chat_fallback_batch_id as string | undefined;

            // Cancel fallback batch if exists
            if (fallbackBatchId) {
                try {
                    await cancelBatch(fallbackBatchId);
                } catch (e) {
                    console.warn('[DirectChat] Failed to cancel fallback batch:', e);
                }
            }

            // Cancel local batch
            return await cancelDirectChatBatch(batchId) as unknown as { status: string } | BatchErrorResponse;
        }

        // Route Gemini cancellation. Resolve the Gemini provider secret directly
        // instead of using mutable current consolidation defaults so existing
        // Gemini jobs can still be cancelled after admins switch providers.
        if (lookupRow && lookupRow.execution_mode === 'gemini_batch') {
            const geminiApiKey = await getAIScrapingProviderSecret('gemini');
            const result = await cancelGeminiBatchProvider(batchId, geminiApiKey || '');
            if ('success' in result && !result.success) {
                return result;
            }
            return { status: 'cancelled' };
        }

        // Use createClient (not createAdminClient) for status update — matches existing test mocks
        const supabase = await createClient();

        const resolved = await resolveProviderBatchId(batchId);
        const runtime = await getConfiguredBatchRuntime();
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        const client = await getOpenAIClient();
        if (!client) {
            return { success: false, error: 'LLM provider not configured' };
        }
        await client.batches.cancel(resolved.providerBatchId);

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
