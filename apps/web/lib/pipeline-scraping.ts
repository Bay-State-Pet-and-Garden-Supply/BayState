'use server';

import { createClient } from '@/lib/supabase/server';
import {
    brandHintToSlug,
    findBrandRegistryByHints,
    getBrandRegistryName,
    loadBrandRegistryEntries,
    toBrandRegistryEntry,
    type BrandRegistryEntry,
    type BrandRegistryRow,
} from '@/lib/brand-registry';

import { getDatabaseScraperConfigs } from '@/lib/admin/scrapers/configs-db';
import type { ScraperConfig } from '@/lib/admin/scrapers/types';
import type { 
    ScrapeOptions, 
    ScrapeResult 
} from './pipeline-scraping-types';

export type { ScrapeOptions } from './pipeline-scraping-types';



interface PipelineInputRow {
    sku: string;
    cohort_id?: string | null;
    consolidated?: {
        brand_id?: unknown;
        brand_name?: unknown;
        brand?: unknown;
    } | null;
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
        | BrandRegistryRow
        | Array<BrandRegistryRow>
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

type ScrapeJobInsertType = 'standard';

/**
 * Options for scraping jobs.
 */

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

function getLeadingBrandHintCandidates(
    value: unknown,
    maxWords = 4,
): string[] {
    const normalized = toOptionalString(value);
    if (!normalized) {
        return [];
    }

    const tokens = normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);

    const candidates: string[] = [];
    for (let length = Math.min(tokens.length, maxWords); length >= 1; length -= 1) {
        const candidate = tokens.slice(0, length).join(' ');
        if (candidate.length > 1) {
            candidates.push(candidate);
        }
    }

    return Array.from(new Set(candidates));
}

interface ScrapeContextItem {
    sku: string;
    product_name?: string;
    register_name?: string;
    price?: number;
    brand?: string;
    category?: string;
    preferred_domains?: string[];
    official_domains?: string[];
}

interface CohortLookupRow {
    id?: string | null;
    brand_name?: unknown;
    brand_id?: unknown;
    brands?: BrandRegistryRow | BrandRegistryRow[] | null;
}

function compactScrapeContextItem(item: ScrapeContextItem): ScrapeContextItem {
    const compacted: ScrapeContextItem = {
        sku: item.sku,
    };

    if (item.product_name !== undefined) {
        compacted.product_name = item.product_name;
    }

    if (item.register_name !== undefined) {
        compacted.register_name = item.register_name;
    }

    if (item.price !== undefined) {
        compacted.price = item.price;
    }

    if (item.brand !== undefined) {
        compacted.brand = item.brand;
    }

    if (item.category !== undefined) {
        compacted.category = item.category;
    }

    if (item.preferred_domains !== undefined) {
        compacted.preferred_domains = item.preferred_domains;
    }

    if (item.official_domains !== undefined) {
        compacted.official_domains = item.official_domains;
    }

    return compacted;
}

function normalizeDomainCandidate(value: string): string | undefined {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return undefined;
    }

    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

    try {
        const hostname = new URL(withProtocol).hostname.toLowerCase();
        return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
        const fallback = trimmed
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            ?.trim();
        return fallback || undefined;
    }
}


function mergeOfficialDomains(...domainLists: Array<string[] | undefined>): string[] | undefined {
    const ordered: string[] = [];
    const seen = new Set<string>();

    domainLists.forEach((domainList) => {
        domainList?.forEach((candidate) => {
            const normalized = normalizeDomainCandidate(candidate);
            if (!normalized || seen.has(normalized)) {
                return;
            }

            seen.add(normalized);
            ordered.push(normalized);
        });
    });

    return ordered.length > 0 ? ordered : undefined;
}

function mergePreferredDomains(...domainLists: Array<string[] | undefined>): string[] | undefined {
    const ordered: string[] = [];
    const seen = new Set<string>();

    domainLists.forEach((domainList) => {
        domainList?.forEach((candidate) => {
            const normalized = normalizeDomainCandidate(candidate);
            if (!normalized || seen.has(normalized)) {
                return;
            }

            seen.add(normalized);
            ordered.push(normalized);
        });
    });

    return ordered.length > 0 ? ordered : undefined;
}

function getCatalogBrandEntry(
    brandRelation: ProductCatalogRow['brand']
): BrandRegistryEntry | undefined {
    return toBrandRegistryEntry(brandRelation);
}

async function loadCohortBrandRegistryEntries(
    supabase: Awaited<ReturnType<typeof createClient>>,
    cohortIds: string[]
): Promise<Map<string, BrandRegistryEntry>> {
    const normalizedCohortIds = Array.from(new Set(cohortIds.filter(Boolean)));
    if (normalizedCohortIds.length === 0) {
        return new Map();
    }

    const { data, error } = await supabase
        .from('cohort_batches')
        .select('id, brand_name, brand_id, brands(id, name, slug, official_domains, preferred_domains)')
        .in('id', normalizedCohortIds);

    if (error) {
        console.warn('[Pipeline Scraping] Failed to load cohort brand registry context:', error);
        return new Map();
    }

    const entries = new Map<string, BrandRegistryEntry>();
    const rows = Array.isArray(data) ? (data as CohortLookupRow[]) : [];
    rows.forEach((row) => {
        const cohortId = toOptionalString(row.id);
        if (!cohortId) {
            return;
        }

        const joinedBrand = toBrandRegistryEntry(row.brands);
        const fallbackName = toOptionalString(row.brand_name);
        const fallbackId = toOptionalString(row.brand_id);
        const entry: BrandRegistryEntry = {
            id: joinedBrand?.id ?? fallbackId,
            slug: joinedBrand?.slug,
            name: joinedBrand?.name ?? fallbackName,
            preferredDomains: joinedBrand?.preferredDomains,
            officialDomains: joinedBrand?.officialDomains,
        };

        if (entry.id || entry.slug || entry.name || entry.preferredDomains) {
            entries.set(cohortId, entry);
        }
    });

    return entries;
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


async function createEnrichmentAttempts(
    supabase: Awaited<ReturnType<typeof createClient>>,
    jobId: string,
    skus: string[],
    jobMode: string,
    jobModel: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
    const attempts = skus.map((sku) => ({
        job_id: jobId,
        sku,
        attempt_number: 1,
        status: 'queued',
        mode: jobMode,
        model: jobModel,
    }));

    const { error } = await supabase
        .from('enrichment_attempts')
        .insert(attempts);

    if (error) {
        console.error('[Pipeline Scraping] Failed to create enrichment attempts:', error);
        return { success: false, error: 'Failed to create enrichment attempts' };
    }

    return { success: true };
}

async function cloneScrapeJobForRetry(
    supabase: Awaited<ReturnType<typeof createClient>>,
    originalJob: {
        id: string;
        skus?: string[] | null;
        mode?: string | null;
        model?: string | null;
        config?: Record<string, unknown> | null;
    },
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
    const skus = Array.isArray(originalJob.skus) ? originalJob.skus : [];

    if (skus.length === 0) {
        return { success: false, error: 'Original job has no SKUs to retry' };
    }

    const nowIso = new Date().toISOString();
    const jobMode = originalJob.mode ?? 'mixed';
    const jobModel = originalJob.model ?? null;

    const { data: newJob, error: createError } = await supabase
        .from('enrichment_jobs')
        .insert({
            status: 'queued',
            skus,
            total_count: skus.length,
            completed_count: 0,
            failed_count: 0,
            mode: jobMode,
            model: jobModel,
            config: originalJob.config ?? {},
            updated_at: nowIso,
        })
        .select('id')
        .single();

    if (createError || !newJob) {
        console.error('[Pipeline Scraping] Failed to create retried job:', createError);
        return { success: false, error: 'Failed to retry enrichment run' };
    }

    const attemptResult = await createEnrichmentAttempts(
        supabase,
        newJob.id,
        skus,
        jobMode,
        jobModel
    );

    if (!attemptResult.success) {
        await supabase.from('enrichment_jobs').delete().eq('id', newJob.id);
        return attemptResult;
    }

    return {
        success: true,
        jobId: newJob.id,
    };
}


async function loadScrapeContextItems(
    supabase: Awaited<ReturnType<typeof createClient>>,
    skus: string[],
    options?: {
        preferCatalogContext?: boolean;
        fallbackBrandHint?: string;
        useBrandRegistryFallback?: boolean;
    }
): Promise<ScrapeContextItem[]> {
    const preferCatalogContext = options?.preferCatalogContext ?? false;
    const fallbackBrandHint = toOptionalString(options?.fallbackBrandHint);
    const useBrandRegistryFallback = options?.useBrandRegistryFallback ?? false;

    const [{ data: ingestionData, error: ingestionError }, { data: productData, error: productError }] = await Promise.all([
        supabase
            .from('products_ingestion')
            .select('sku, cohort_id, consolidated, input')
            .in('sku', skus),
        supabase
            .from('products')
            .select('sku, name, brand:brands(name, official_domains, preferred_domains), product_categories(category:categories(name))')
            .in('sku', skus),
    ]);

    if (ingestionError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products_ingestion:', ingestionError);
    }

    if (productError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products:', productError);
    }

    const ingestionRows = Array.isArray(ingestionData) ? (ingestionData as PipelineInputRow[]) : [];
    const ingestionBySku = new Map(ingestionRows.map((row) => [row.sku, row]));

    const productRows = Array.isArray(productData) ? (productData as ProductCatalogRow[]) : [];
    const productBySku = new Map<string, ProductCatalogRow>();
    productRows.forEach((row) => {
        const rowSku = toOptionalString(row.sku);
        if (rowSku) {
            productBySku.set(rowSku, row);
        }
    });

    let brandRegistryLookup: { byId: Map<string, BrandRegistryEntry>; bySlug: Map<string, BrandRegistryEntry> } = {
        byId: new Map(),
        bySlug: new Map(),
    };
    let cohortBrandEntries = new Map<string, BrandRegistryEntry>();

    if (useBrandRegistryFallback) {
        const brandIds = new Set<string>();
        const brandSlugs = new Set<string>();
        const cohortIds = new Set<string>();

        if (fallbackBrandHint) {
            const fallbackSlug = brandHintToSlug(fallbackBrandHint);
            if (fallbackSlug) {
                brandSlugs.add(fallbackSlug);
            }
        }

        ingestionRows.forEach((row) => {
            const consolidated = row.consolidated;
            const brandId = toOptionalString(consolidated?.brand_id);
            if (brandId) {
                brandIds.add(brandId);
            }

            const explicitBrandHints = [consolidated?.brand_name, consolidated?.brand, row.input?.brand];

            explicitBrandHints.forEach((brandHint) => {
                const slug = brandHintToSlug(brandHint);
                if (slug) {
                    brandSlugs.add(slug);
                }
            });

            const hasExplicitBrandHint = explicitBrandHints.some((brandHint) => Boolean(toOptionalString(brandHint)));
            if (!hasExplicitBrandHint) {
                getLeadingBrandHintCandidates(row.input?.name).forEach((brandHint) => {
                    const slug = brandHintToSlug(brandHint);
                    if (slug) {
                        brandSlugs.add(slug);
                    }
                });
            }

            const cohortId = toOptionalString(row.cohort_id);
            if (cohortId) {
                cohortIds.add(cohortId);
            }
        });

        brandRegistryLookup = await loadBrandRegistryEntries(supabase, {
            brandIds: Array.from(brandIds),
            brandSlugs: Array.from(brandSlugs),
        });
        cohortBrandEntries = await loadCohortBrandRegistryEntries(supabase, Array.from(cohortIds));
    }

    return skus.map((sku) => {
        const ingestion = ingestionBySku.get(sku);
        const input = ingestion?.input ?? null;
        const product = productBySku.get(sku);
        const catalogBrandEntry = getCatalogBrandEntry(product?.brand);
        const consolidatedBrandId = toOptionalString(ingestion?.consolidated?.brand_id);
        const nameDerivedBrandHints = getLeadingBrandHintCandidates(input?.name);
        const registryBrandById = consolidatedBrandId
            ? brandRegistryLookup.byId.get(consolidatedBrandId)
            : undefined;
        const registryBrandByHint = findBrandRegistryByHints(
            [
                toOptionalString(ingestion?.consolidated?.brand_name),
                toOptionalString(ingestion?.consolidated?.brand),
                toOptionalString(input?.brand),
                fallbackBrandHint,
                ...nameDerivedBrandHints,
            ],
            brandRegistryLookup.bySlug,
        );
        const cohortBrandEntry = (() => {
            const cohortId = toOptionalString(ingestion?.cohort_id);
            return cohortId ? cohortBrandEntries.get(cohortId) : undefined;
        })();
        const resolvedBrandEntry = catalogBrandEntry
            ?? registryBrandById
            ?? registryBrandByHint
            ?? cohortBrandEntry;

        const ingestionName = toOptionalString(input?.name);
        const catalogName = toOptionalString(product?.name);
        const ingestionBrand = toOptionalString(input?.brand);
        const catalogBrand = catalogBrandEntry?.name ?? getBrandRegistryName(product?.brand);
        const ingestionCategory = toOptionalString(input?.category);
        const catalogCategory = getCatalogCategoryName(product?.product_categories);
        const resolvedBrandName = resolvedBrandEntry?.name;
        const resolvedOfficialDomains = mergeOfficialDomains(
            catalogBrandEntry?.officialDomains,
            registryBrandById?.officialDomains,
            registryBrandByHint?.officialDomains,
            cohortBrandEntry?.officialDomains,
        );
        const resolvedPreferredDomains = mergePreferredDomains(
            catalogBrandEntry?.preferredDomains,
            registryBrandById?.preferredDomains,
            registryBrandByHint?.preferredDomains,
            cohortBrandEntry?.preferredDomains,
        );

        return compactScrapeContextItem({
            sku,
            product_name: preferCatalogContext
                ? catalogName ?? ingestionName
                : ingestionName ?? catalogName,
            register_name: ingestionName,
            price: toOptionalNumber(input?.price),
            brand: preferCatalogContext
                ? catalogBrand ?? ingestionBrand ?? resolvedBrandName
                : ingestionBrand ?? catalogBrand ?? resolvedBrandName,
            category: preferCatalogContext
                ? catalogCategory ?? ingestionCategory
                : ingestionCategory ?? catalogCategory,
            official_domains: resolvedOfficialDomains,
            preferred_domains: resolvedPreferredDomains,
        });
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

    const testMode = options?.testMode ?? false;
    const scrapers = options?.scrapers ?? [];

    // Resolve scraper display names to slugs if possible using local YAML configs
    let effectiveScrapers = scrapers;
    if (scrapers.length > 0) {
        const configs = await getDatabaseScraperConfigs();
        
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
            effectiveScrapers = scrapers.map(s => slugMap.get(s.toLowerCase()) || s);
        }
    }

    const supabase = await createClient();
    const scrapeContextItems = await loadScrapeContextItems(supabase, skus, {});
    const standardSkuContext = buildStandardSkuContext(scrapeContextItems);
    const nowIso = new Date().toISOString();

    const jobMode = 'mixed';
    const jobModel = null;
    const jobConfig = {
        scrapers: effectiveScrapers,
        sku_context: standardSkuContext,
        test_mode: testMode,
        source: 'pipeline',
        pipeline_version: 'static_first_v1',
    };

    const { data: job, error: insertError } = await supabase
        .from('enrichment_jobs')
        .insert({
            status: 'queued',
            skus,
            total_count: skus.length,
            completed_count: 0,
            failed_count: 0,
            mode: jobMode,
            model: jobModel,
            config: jobConfig,
            items_processed: 0,
            items_total: skus.length,
            updated_at: nowIso,
        })
        .select('id')
        .single();

    if (insertError || !job) {
        console.error('[Pipeline Scraping] Failed to create enrichment job:', insertError);
        const errorMessage =
            insertError && typeof insertError === 'object' && 'message' in insertError
                ? String((insertError as { message?: unknown }).message ?? '')
                : JSON.stringify(insertError);
        return { success: false, error: `Failed to create enrichment job: ${errorMessage}` };
    }

    const attemptResult = await createEnrichmentAttempts(
        supabase,
        job.id,
        skus,
        jobMode,
        jobModel
    );

    if (!attemptResult.success) {
        await supabase.from('enrichment_jobs').delete().eq('id', job.id);
        return { success: false, error: attemptResult.error };
    }

    if (!testMode) {
        const { error: statusError } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'extracting',
                updated_at: new Date().toISOString(),
                error_message: null,
            })
            .in('sku', skus);

        if (statusError) {
            console.error('[Pipeline Scraping] Failed to move products into extracting:', statusError);
            await supabase.from('enrichment_attempts').delete().eq('job_id', job.id);
            await supabase.from('enrichment_jobs').delete().eq('id', job.id);
            return { success: false, error: 'Failed to mark products as extracting' };
        }
    }

    console.log(`[Pipeline Scraping] Created enrichment job ${job.id} for ${skus.length} SKUs`);

    return {
        success: true,
        jobIds: [job.id],
    };
}
