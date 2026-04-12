'use server';

import { createClient } from '@/lib/supabase/server';

import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';

interface PipelineInputRow {
    sku: string;
    input?: {
        name?: unknown;
        price?: unknown;
        brand?: unknown;
        category?: unknown;
    } | null;
}

interface ProductCatalogRow {
    sku?: string | null;
    name?: unknown;
    brand?:
        | {
            name?: unknown;
        }
        | Array<{
            name?: unknown;
        }>
        | null;
    product_categories?: Array<{
        category?:
            | {
                name?: unknown;
            }
            | Array<{
                name?: unknown;
            }>
            | null;
    }> | null;
}

interface PostgrestLikeError {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
}

type ScrapeJobInsertType = 'standard' | 'ai_search' | 'discovery';

function isLegacyJobTypeConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as PostgrestLikeError;
    const code = typeof maybeError.code === 'string' ? maybeError.code : '';
    const message = typeof maybeError.message === 'string' ? maybeError.message : '';
    const details = typeof maybeError.details === 'string' ? maybeError.details : '';

    return (
        code === '23514' &&
        (message.includes('scrape_jobs_type_check') || details.includes('scrape_jobs_type_check'))
    );
}

/**
 * Options for scraping jobs.
 */
export interface ScrapeOptions {
    /** Workers per runner (default: 3) */
    maxWorkers?: number;
    /** Run in test mode */
    testMode?: boolean;
    /** Specific scrapers to use (empty = all) */
    scrapers?: string[];
    maxRunners?: number;
    /** Maximum retry attempts before terminal failure (default: 3) */
    maxAttempts?: number;
    /** Number of SKUs per chunk (default: 50) */
    chunkSize?: number;
    jobType?: 'standard' | 'ai_search';
    /** Explicit enrichment method - takes precedence over jobType */
    enrichment_method?: 'scrapers' | 'ai_search';
    aiSearchConfig?: {
        product_name?: string;
        brand?: string;
        max_search_results?: number;
        max_steps?: number;
        confidence_threshold?: number;
        llm_provider?: 'openai';
        llm_model?: string;
        llm_base_url?: string | null;
        prefer_manufacturer?: boolean;
        fallback_to_static?: boolean;
        max_concurrency?: number;
        extraction_strategy?: 'llm' | 'llm_free' | 'auto';
        cache_enabled?: boolean;
        max_retries?: number;
        timeout?: number;
    };
    /** Maximum cost in USD for AI Search jobs (default: 5.00, max: 10.00) */
    maxAISearchCostUsd?: number;
    /** Brand name from cohort assignment — injected into context items that lack a brand */
    cohortBrand?: string;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    error?: string;
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().replace(/[$,]/g, '');
        if (!normalized) {
            return undefined;
        }

        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

interface ScrapeContextItem {
    sku: string;
    product_name?: string;
    price?: number;
    brand?: string;
    category?: string;
}

function getCatalogBrandName(
    brandRelation: ProductCatalogRow['brand']
): string | undefined {
    const brand = Array.isArray(brandRelation) ? brandRelation[0] ?? null : brandRelation;
    return toOptionalString(brand?.name);
}

function getCatalogCategoryName(
    productCategories: ProductCatalogRow['product_categories']
): string | undefined {
    for (const productCategory of productCategories ?? []) {
        const categoryRelation = productCategory.category;
        const category = Array.isArray(categoryRelation)
            ? categoryRelation[0] ?? null
            : categoryRelation;
        const categoryName = toOptionalString(category?.name);
        if (categoryName) {
            return categoryName;
        }
    }

    return undefined;
}

async function loadScrapeContextItems(
    supabase: Awaited<ReturnType<typeof createClient>>,
    skus: string[],
    options?: {
        preferCatalogContext?: boolean;
    }
): Promise<ScrapeContextItem[]> {
    const preferCatalogContext = options?.preferCatalogContext ?? false;

    const [{ data: ingestionData, error: ingestionError }, { data: productData, error: productError }] = await Promise.all([
        supabase
            .from('products_ingestion')
            .select('sku, input')
            .in('sku', skus),
        supabase
            .from('products')
            .select('sku, name, brand:brands(name), product_categories(category:categories(name))')
            .in('sku', skus),
    ]);

    if (ingestionError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products_ingestion:', ingestionError);
    }

    if (productError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products:', productError);
    }

    const ingestionRows = Array.isArray(ingestionData) ? (ingestionData as PipelineInputRow[]) : [];
    const ingestionBySku = new Map(ingestionRows.map((row) => [row.sku, row.input ?? null]));

    const productRows = Array.isArray(productData) ? (productData as ProductCatalogRow[]) : [];
    const productBySku = new Map<string, ProductCatalogRow>();
    productRows.forEach((row) => {
        const rowSku = toOptionalString(row.sku);
        if (rowSku) {
            productBySku.set(rowSku, row);
        }
    });

    return skus.map((sku) => {
        const input = ingestionBySku.get(sku);
        const product = productBySku.get(sku);

        const ingestionName = toOptionalString(input?.name);
        const catalogName = toOptionalString(product?.name);
        const ingestionBrand = toOptionalString(input?.brand);
        const catalogBrand = getCatalogBrandName(product?.brand);
        const ingestionCategory = toOptionalString(input?.category);
        const catalogCategory = getCatalogCategoryName(product?.product_categories);

        return {
            sku,
            product_name: preferCatalogContext
                ? catalogName ?? ingestionName
                : ingestionName ?? catalogName,
            price: toOptionalNumber(input?.price),
            brand: preferCatalogContext
                ? catalogBrand ?? ingestionBrand
                : ingestionBrand ?? catalogBrand,
            category: preferCatalogContext
                ? catalogCategory ?? ingestionCategory
                : ingestionCategory ?? catalogCategory,
        };
    });
}

type StandardSkuContext = {
    product_name?: string;
    price?: number;
    brand?: string;
    category?: string;
};

function buildStandardSkuContext(items: ScrapeContextItem[]): Record<string, StandardSkuContext> | undefined {
    const skuContextEntries: Array<readonly [string, StandardSkuContext]> = [];

    items.forEach((item) => {
        const context: StandardSkuContext = {
            product_name: item.product_name,
            price: item.price,
            brand: item.brand,
            category: item.category,
        };

        const hasContext = Object.values(context).some((value) => value !== undefined);
        if (hasContext) {
            skuContextEntries.push([item.sku, context]);
        }
    });

    if (skuContextEntries.length === 0) {
        return undefined;
    }

    return Object.fromEntries(skuContextEntries);
}

export async function scrapeProducts(
    skus: string[],
    options?: ScrapeOptions
): Promise<ScrapeResult> {
    if (!skus || skus.length === 0) {
        return { success: false, error: 'No SKUs provided' };
    }

    const maxWorkers = options?.maxWorkers ?? 3;
    const testMode = options?.testMode ?? false;
    const scrapers = options?.scrapers ?? [];
    const maxAttempts = options?.maxAttempts ?? 3;
    const chunkSize = options?.chunkSize ?? 50; // Default 50 SKUs per chunk
    const enrichmentMethod = options?.enrichment_method ?? (options?.jobType === 'ai_search' ? 'ai_search' : 'scrapers');
    const isAISearch = enrichmentMethod === 'ai_search';
    const effectiveScrapersRaw = isAISearch ? ['ai_search'] : scrapers;
    const jobType: ScrapeJobInsertType = isAISearch ? 'ai_search' : 'standard';

    // Resolve scraper display names to slugs if possible using local YAML configs
    let effectiveScrapers = effectiveScrapersRaw;
    if (scrapers.length > 0 && !isAISearch) {
        const configs = await getLocalScraperConfigs();
        
        if (configs && configs.length > 0) {
            const slugMap = new Map<string, string>();
            configs.forEach(config => {
                const slug = config.slug;
                if (!slug) {
                    return;
                }

                slugMap.set(slug.toLowerCase(), slug);
                if (config.display_name) {
                    slugMap.set(config.display_name.toLowerCase(), slug);
                }
            });
            effectiveScrapers = effectiveScrapersRaw.map(s => slugMap.get(s.toLowerCase()) || s);
        }
    }

    const supabase = await createClient();
    const scrapeContextItems = await loadScrapeContextItems(supabase, skus, {
        preferCatalogContext: isAISearch,
    });

    // Inject cohort brand into context items that lack one
    const cohortBrand = toOptionalString(options?.cohortBrand);
    if (cohortBrand) {
        scrapeContextItems.forEach((item) => {
            if (!item.brand) {
                item.brand = cohortBrand;
            }
        });
    }

    const standardSkuContext = isAISearch ? undefined : buildStandardSkuContext(scrapeContextItems);

    const maxAISearchCostUsd = isAISearch ? (options?.maxAISearchCostUsd ?? 5.00) : undefined;
    if (isAISearch && maxAISearchCostUsd !== undefined && maxAISearchCostUsd > 10.00) {
        return { success: false, error: 'Cost cap exceeds maximum of $10.00' };
    }

    const nowIso = new Date().toISOString();

    const buildJobInsertPayload = (type: ScrapeJobInsertType) => ({
        skus,
        scrapers: effectiveScrapers,
        test_mode: testMode,
        max_workers: maxWorkers,
        status: 'pending',
        attempt_count: 0,
        max_attempts: maxAttempts,
        backoff_until: null,
        lease_token: null,
        leased_at: null,
        lease_expires_at: null,
        heartbeat_at: null,
        runner_name: null,
        started_at: null,
        type,
        config: isAISearch ? {
            ...(options?.aiSearchConfig ?? {}),
            items: scrapeContextItems,
            max_cost_usd: maxAISearchCostUsd,
        } : (standardSkuContext ? { sku_context: standardSkuContext } : null),
        metadata: isAISearch
            ? {
                source: 'pipeline',
                mode: 'ai_search',
                requested_job_type: 'ai_search',
                stored_job_type: type,
            }
            : null,
        updated_at: nowIso,
    });

    let { data: job, error: insertError } = await supabase
        .from('scrape_jobs')
        .insert(buildJobInsertPayload(jobType))
        .select('id')
        .single();

    if (insertError && isAISearch && isLegacyJobTypeConstraintError(insertError)) {
        console.warn('[Pipeline Scraping] Legacy scrape_jobs type constraint detected; retrying AI search insert using discovery type');
        const retryResult = await supabase
            .from('scrape_jobs')
            .insert(buildJobInsertPayload('discovery'))
            .select('id')
            .single();

        job = retryResult.data;
        insertError = retryResult.error;
    }

    if (insertError || !job) {
        console.error('[Pipeline Scraping] Failed to create parent job:', insertError);
        const errorMessage =
            insertError && typeof insertError === 'object' && 'message' in insertError
                ? String((insertError as { message?: unknown }).message ?? '')
                : JSON.stringify(insertError);
        return { success: false, error: `Failed to create scraping job: ${errorMessage}` };
    }

    // Create chunks with configurable size (default 50 SKUs per chunk)
    const chunks: Array<{
        job_id: string;
        chunk_index: number;
        skus: string[];
        scrapers: string[];
        status: string;
        updated_at: string;
    }> = [];

    for (let i = 0; i < skus.length; i += chunkSize) {
        chunks.push({
            job_id: job.id,
            chunk_index: chunks.length,
            skus: skus.slice(i, i + chunkSize),
            scrapers: effectiveScrapers,
            status: 'pending',
            updated_at: nowIso,
        });
    }

    const { error: unitsError } = await supabase
        .from('scrape_job_chunks')
        .insert(chunks);

    if (unitsError) {
        console.error('[Pipeline Scraping] Failed to create work units:', unitsError);
        await supabase.from('scrape_jobs').delete().eq('id', job.id);
        return { success: false, error: 'Failed to create scraping work units' };
    }

    if (!testMode) {
        const { error: statusError } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'scraping',
                updated_at: new Date().toISOString(),
                error_message: null,
            })
            .in('sku', skus);

        if (statusError) {
            console.error('[Pipeline Scraping] Failed to move products into scraping:', statusError);
            await supabase.from('scrape_job_chunks').delete().eq('job_id', job.id);
            await supabase.from('scrape_jobs').delete().eq('id', job.id);
            return { success: false, error: 'Failed to mark products as scraping' };
        }
    }

    console.log(`[Pipeline Scraping] Created parent job ${job.id} with ${chunks.length} chunks (${chunkSize} SKUs each)`);

    return {
        success: true,
        jobIds: [job.id],
    };
}
