/**
 * Batch Service
 *
 * Core service for OpenAI Batch API operations.
 * Handles batch submission, status checking, and result retrieval.
 * Ported and adapted from BayStateTools.
 */

import { createClient } from '@/lib/supabase/server';
import {
    CONSOLIDATION_CONFIG,
    getConsolidationConfig,
    getOpenAIClient,
    type ConsolidationRuntimeConfig,
} from './openai-client';
import { buildPromptContext, buildUserPrompt } from './prompt-builder';
import {
    buildOpenAIResponseFormat,
    buildResponseSchema,
    validateCategory,
    validateConsolidationTaxonomy,

    validateRequiredConsolidationFields,
} from './taxonomy-validator';
import { normalizeConsolidationResult, parseJsonResponse } from './result-normalizer';
import { calculateAICost } from '@/lib/ai-scraping/pricing';
import { extractImageCandidatesFromSources, normalizeProductSources, normalizeImageUrl } from '@/lib/product-sources';
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
    'weight',
    'size',
    'attributes',
    'description',
    'long_description',
    'category',
    'categories',
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
            return 360;
        case 'long_description':
            return 520;
        case 'specifications':
            return 360;
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

interface BatchRowLookup {
    id: string;
    provider: ConsolidationRuntimeConfig['llm_provider'];
    provider_batch_id: string | null;
    total_requests?: number | null;
    completed_requests?: number | null;
    failed_requests?: number | null;
    metadata: Record<string, unknown> | null;
}

type BatchProviderKey = ConsolidationRuntimeConfig['llm_provider'];

function normalizeBatchProvider(value: unknown): BatchProviderKey {
    void value;
    return 'openai';
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

    // Final fallback: SKUs sorted
    return products
        .map((product) => product.sku.trim())
        .filter((sku) => sku.length > 0)
        .sort()
        .join('|');
}

async function findBatchJobRow(
    batchIdentifier: string
): Promise<{ row: BatchRowLookup | null; lookupError: string | null }> {
    const { createAdminClient } = await import('@/lib/supabase/server');
    const supabase = await createAdminClient();

    // 1. Try to find by provider-native identifiers if it's not a UUID.
    if (!isUuid(batchIdentifier)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select('id, provider, provider_batch_id, openai_batch_id, total_requests, completed_requests, failed_requests, metadata')
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
            .select('id, provider, provider_batch_id, openai_batch_id, total_requests, completed_requests, failed_requests, metadata')
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
    provider: BatchProviderKey;
    providerBatchId: string;
}> {
    if (!isUuid(batchIdentifier)) {
        const { row } = await findBatchJobRow(batchIdentifier);
        return {
            provider: row?.provider ?? 'openai',
            providerBatchId: row?.provider_batch_id ?? batchIdentifier,
        };
    }

    const { row } = await findBatchJobRow(batchIdentifier);
    if (!row) {
        return {
            provider: 'openai',
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

function parseStructuredConsolidationText(
    sku: string,
    content: string,
    shopsitePages: string[],
    categories: string[]
): ConsolidationResult {
    const parsed = parseJsonResponse(content);

    if (!parsed) {
        return { sku, error: 'Failed to parse JSON response' };
    }

    const normalized = normalizeConsolidationResult(parsed, shopsitePages);
    const requiredFieldsValidated = validateRequiredConsolidationFields(normalized);
    const validated = validateConsolidationTaxonomy(requiredFieldsValidated, categories);

    const categoryValues = parseTaxonomyValues(
        typeof validated.category === 'string' ? validated.category : undefined
    );

    const normalizedCategory = categoryValues
        .map((value) => validateCategory(value, categories))
        .filter((value, index, array) => array.indexOf(value) === index);

    if (normalizedCategory.length === 0) {
        return {
            sku,
            error: 'Invalid taxonomy values returned by consolidation model',
        };
    }

    const productOnPages = Array.isArray(validated.product_on_pages)
        ? (validated.product_on_pages as string[]).join('|')
        : typeof validated.product_on_pages === 'string'
            ? validated.product_on_pages
            : undefined;

    return {
        sku,
        ...validated,
        category: normalizedCategory.join('|'),
        ...(productOnPages ? { product_on_pages: productOnPages } : {}),
    } as ConsolidationResult;
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

function cleanBrandLabel(rawBrandName: unknown): string | undefined {
    if (typeof rawBrandName !== 'string') {
        return undefined;
    }

    const stripped = rawBrandName.replace(/^brand\s*:\s*/i, '').trim();
    return normalizeBrandName(stripped) || undefined;
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
        value.forEach((entry) => {
            collectAnimalSignalsFromValue(entry, detected, depth + 1);
        });
        return;
    }

    if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((entry) => {
            collectAnimalSignalsFromValue(entry, detected, depth + 1);
        });
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
    collectAnimalSignalsFromValue(nextFields.product_on_pages, detected);
    return detected;
}

function summarizeAnimalSignals(signals: Iterable<AnimalSignal>): string {
    return Array.from(signals).sort().join(', ');
}

function getPreferredTrustedBrand(
    sources: Record<string, unknown>
): { brand: string; source: string } | null {
    const evidence = Object.entries(normalizeProductSources(sources))
        .filter(([, data]) => data && typeof data === 'object' && !Array.isArray(data))
        .map(([source, data]) => ({
            source,
            trust: getSourceTrustLevel(source),
            fields: data as Record<string, unknown>,
        }))
        .sort(
            (left, right) =>
                getPromptEvidenceSortRank(left.source, left.trust)
                - getPromptEvidenceSortRank(right.source, right.trust)
        );

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
    const openAIResponseFormat = responseSchema ? buildOpenAIResponseFormat(responseSchema) : undefined;

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
                ...(openAIResponseFormat ? { response_format: openAIResponseFormat } : {}),
            },
        };

        lines.push(JSON.stringify(request));
    }

    return lines.join('\n');
}

async function getConfiguredBatchRuntime(
    requireBatchApi: boolean,
    options?: {
        routingKey?: string;
        forceProvider?: BatchProviderKey;
    }
): Promise<ConsolidationRuntimeConfig | BatchErrorResponse> {
    const config = await getConsolidationConfig(options);

    if (requireBatchApi && !config.llm_supports_batch_api) {
        return {
            success: false,
            error: 'Selected LLM endpoint does not support the Batch API required for consolidation',
        };
    }

    if (!config.llm_api_key) {
        return { success: false, error: 'LLM provider not configured' };
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

async function submitBatchToProvider(
    runtime: ConsolidationRuntimeConfig,
    content: string,
    displayName: string,
    metadata: Record<string, string>
): Promise<{
    providerBatchId: string;
    providerStatus: string;
    inputFileId: string | null;
    outputFileId: string | null;
    errorFileId: string | null;
}> {
    const client = await getOpenAIClient({ forceProvider: runtime.llm_provider });
    if (!client) {
        throw new Error('LLM provider not configured');
    }

    const blob = new Blob([content], { type: 'application/jsonl' });
    const file = new File([blob], 'batch.jsonl', { type: 'application/jsonl' });
    const fileResponse = await client.files.create({
        file,
        purpose: 'batch',
    });

    const batch = await client.batches.create({
        input_file_id: fileResponse.id,
        endpoint: '/v1/chat/completions',
        completion_window: runtime.completionWindow,
        metadata,
    });

    return {
        providerBatchId: batch.id,
        providerStatus: batch.status,
        inputFileId: fileResponse.id,
        outputFileId: batch.output_file_id ?? null,
        errorFileId: batch.error_file_id ?? null,
    };
}

async function persistBatchJobRecord(payload: {
    provider: BatchProviderKey;
    providerBatchId: string;
    providerStatus: string;
    inputFileId: string | null;
    outputFileId: string | null;
    errorFileId: string | null;
    description: string | null;
    autoApply: boolean;
    totalRequests: number;
    metadata: Record<string, string>;
}): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('batch_jobs').insert({
        provider: payload.provider,
        provider_batch_id: payload.providerBatchId,
        provider_input_file_id: payload.inputFileId,
        provider_output_file_id: payload.outputFileId,
        provider_error_file_id: payload.errorFileId,
        openai_batch_id: payload.providerBatchId,
        status: payload.providerStatus,
        description: payload.description,
        auto_apply: payload.autoApply,
        total_requests: payload.totalRequests,
        input_file_id: payload.inputFileId,
        output_file_id: payload.outputFileId,
        error_file_id: payload.errorFileId,
        metadata: payload.metadata,
    });

    if (error) {
        console.error('[Consolidation] Failed to track batch in database:', error);
    }
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

export async function submitBatchByProductLine(
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
export async function submitBatch(
    products: ProductSource[],
    metadata: BatchMetadata = {}
): Promise<SubmitBatchResponse | BatchErrorResponse> {
    if (products.length === 0) {
        return { success: false, error: 'No products to consolidate' };
    }

    try {
        const routingKey = buildBatchRoutingKey(products, metadata);
        const runtime = await getConfiguredBatchRuntime(true, { routingKey });
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }
        const config = runtime;


        // Build prompt context with taxonomy
        const { systemPrompt, shopsitePages = [], categories = [] } = await buildPromptContext();

        // Build JSON schema with enum constraints
        const responseSchema = buildResponseSchema(categories, shopsitePages);

        // Create JSONL content
        const content = createBatchContent(products, systemPrompt, responseSchema, {
            provider: config.llm_provider,
            model: config.model,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
        });
        // Convert metadata to strings for provider metadata and auditing.
        const stringMetadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (value !== undefined) {
                stringMetadata[key] = String(value);
            }
        }
        stringMetadata.llm_provider = config.llm_provider;
        stringMetadata.configured_llm_provider = config.configured_llm_provider;
        stringMetadata.llm_model = config.model;
        stringMetadata.routing_key = routingKey;
        if (config.llm_base_url) {
            stringMetadata.llm_base_url = config.llm_base_url;
        }

        const batchDisplayName =
            typeof metadata.description === 'string' && metadata.description.trim().length > 0
                ? metadata.description.trim()
                : `consolidation-${Date.now()}`;

        const primaryBatch = await submitBatchToProvider(
            config,
            content,
            batchDisplayName,
            stringMetadata
        );

        await persistBatchJobRecord({
            provider: config.llm_provider,
            providerBatchId: primaryBatch.providerBatchId,
            providerStatus: primaryBatch.providerStatus,
            inputFileId: primaryBatch.inputFileId,
            outputFileId: primaryBatch.outputFileId,
            errorFileId: primaryBatch.errorFileId,
            description: metadata.description || null,
            autoApply: !!metadata.auto_apply,
            totalRequests: products.length,
            metadata: stringMetadata,
        });

        return {
            success: true,
            batch_id: primaryBatch.providerBatchId,
            provider: config.llm_provider,
            provider_batch_id: primaryBatch.providerBatchId,
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
    try {
        const lookup = await findBatchJobRow(batchId);
        if (lookup.lookupError) {
            return { success: false, error: lookup.lookupError };
        }

        const resolved = await resolveProviderBatchId(batchId);
        const runtime = await getConfiguredBatchRuntime(false, {
            forceProvider: resolved.provider,
        });
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        const client = await getOpenAIClient({ forceProvider: resolved.provider });
        if (!client) {
            return { success: false, error: 'LLM provider not configured' };
        }

        const batch = await client.batches.retrieve(resolved.providerBatchId);
        const requestCounts = batch.request_counts || { total: 0, completed: 0, failed: 0 };

        const status: BatchStatus = {
            id: batch.id,
            provider: resolved.provider,
            provider_batch_id: batch.id,
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

        const promptTokens = (batch as unknown as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens || 0;
        const completionTokens = (batch as unknown as { usage?: { completion_tokens?: number } }).usage?.completion_tokens || 0;
        const totalTokens = (batch as unknown as { usage?: { total_tokens?: number } }).usage?.total_tokens || 0;
        const batchMetadata =
            batch.metadata && typeof batch.metadata === 'object'
                ? (batch.metadata as Record<string, unknown>)
                : {};
        const costModel =
            typeof batch.model === 'string' && batch.model.trim().length > 0
                ? batch.model.trim()
                : typeof batchMetadata.llm_model === 'string' && batchMetadata.llm_model.trim().length > 0
                    ? batchMetadata.llm_model.trim()
                    : CONSOLIDATION_CONFIG.model;

        const estimatedCost = calculateAICost(
            costModel,
            promptTokens,
            completionTokens,
            true
        );

        const updateData: Record<string, unknown> = {
            provider: resolved.provider,
            provider_batch_id: batch.id,
            provider_input_file_id: batch.input_file_id ?? null,
            provider_output_file_id: batch.output_file_id ?? null,
            provider_error_file_id: batch.error_file_id ?? null,
            status: batch.status,
            total_requests: requestCounts.total || 0,
            completed_requests: requestCounts.completed || 0,
            failed_requests: requestCounts.failed || 0,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            estimated_cost: estimatedCost,
            output_file_id: batch.output_file_id ?? null,
            error_file_id: batch.error_file_id ?? null,
        };

        if (batch.completed_at) {
            updateData.completed_at = new Date(batch.completed_at * 1000).toISOString();
        }

        const upsertPayload: Record<string, unknown> = {
            ...updateData,
            openai_batch_id: batch.id,
            input_file_id: batch.input_file_id ?? null,
        };
        const upsertOnConflict = 'openai_batch_id';

        // Sync status to Supabase.
        const { createAdminClient } = await import('@/lib/supabase/server');
        const supabase = await createAdminClient();

        if (lookup.row) {
            const updateResponse = await supabase
                .from('batch_jobs')
                .update(updateData)
                .eq('id', lookup.row.id);

            if (updateResponse.error) {
                console.warn('[Consolidation] Failed to sync batch status to DB:', updateResponse.error.message);
            }
        } else if (upsertPayload && upsertOnConflict) {
            const { error: upsertError } = await supabase
                .from('batch_jobs')
                .upsert(upsertPayload, { onConflict: upsertOnConflict });

            if (upsertError) {
                console.warn('[Consolidation] Failed to sync batch status to DB:', upsertError.message);
            }
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
    try {
        // Fetch taxonomy for validation
        const { shopsitePages = [], categories = [] } = await buildPromptContext();
        const resolved = await resolveProviderBatchId(batchId);
        const runtime = await getConfiguredBatchRuntime(false, {
            forceProvider: resolved.provider,
        });
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        const results: ConsolidationResult[] = [];

        const client = await getOpenAIClient({ forceProvider: resolved.provider });
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
                        results.push(
                            parseStructuredConsolidationText(
                                sku,
                                content,
                                shopsitePages,
                                categories
                            )
                        );
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
    const brandIdByCanonical = new Map<string, string>();
    for (const brand of brands || []) {
        if (typeof brand.name === 'string' && typeof brand.id === 'string') {
            brandIdByName.set(normalizeLookupKey(brand.name), brand.id);
            const canonicalKey = canonicalizeBrandName(brand.name);
            if (canonicalKey && !brandIdByCanonical.has(canonicalKey)) {
                brandIdByCanonical.set(canonicalKey, brand.id);
            }

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
        const canonicalKey = canonicalizeBrandName(normalizedBrand);

        const existingBrandId =
            brandIdByName.get(lookupKey) || (canonicalKey ? brandIdByCanonical.get(canonicalKey) : undefined);

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
                    pipeline_status: 'scraped',
                    confidence_score: null,
                    error_message: result.error,
                    outcome: 'rejected',
                    existing_consolidated: existingConsolidated,
                });
                continue;
            }

            const normalizedBrand = cleanBrandLabel(result.brand);

            const nextCategory = parseTaxonomyValues(result.category);
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
                    pipeline_status: 'scraped',
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
                pipeline_status: 'scraped',
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
            row.pipeline_status = 'scraped';
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
        const resolved = await resolveProviderBatchId(batchId);
        const runtime = await getConfiguredBatchRuntime(false, {
            forceProvider: resolved.provider,
        });
        if (isRuntimeErrorResponse(runtime)) {
            return runtime;
        }

        const client = await getOpenAIClient({ forceProvider: resolved.provider });
        if (!client) {
            return { success: false, error: 'LLM provider not configured' };
        }
        await client.batches.cancel(resolved.providerBatchId);

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
