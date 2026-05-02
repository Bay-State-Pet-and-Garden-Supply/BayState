'use server';

import { createClient } from '@/lib/supabase/server';
import {
    brandHintToSlug,
    findBrandRegistryByHints,
    getBrandRegistryName,
    getBrandRegistryPreferredDomains,
    loadBrandRegistryEntries,
    toBrandRegistryEntry,
    type BrandRegistryEntry,
    type BrandRegistryRow,
} from '@/lib/brand-registry';

import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
import {
    OFFICIAL_BRAND_EXTRACTION_TYPE,
    OFFICIAL_BRAND_URL_DISCOVERY_TYPE,
    buildManualOfficialBrandCandidateRows,
    normalizeOfficialBrandUrl,
    persistOfficialBrandCandidateRows,
} from '@/lib/official-brand-workflow';
import type { ScraperConfig } from '@/lib/admin/scrapers/types';
import type { 
    PlannedScrapeChunk, 
    PlannedScrapeJob, 
    OfficialBrandCohortContext,
    ScrapeOptions, 
    ScrapeResult 
} from './pipeline-scraping-types';

export type { ScrapeOptions } from './pipeline-scraping-types';

function compactOfficialBrandCohortContext(
    cohort: OfficialBrandCohortContext | undefined,
): OfficialBrandCohortContext | undefined {
    if (!cohort) {
        return undefined;
    }

    const compacted: OfficialBrandCohortContext = {
        id: cohort.id,
        brandId: cohort.brandId,
        brandName: cohort.brandName,
    };

    if (cohort.websiteUrl) {
        compacted.websiteUrl = cohort.websiteUrl;
    }

    if (cohort.officialDomains && cohort.officialDomains.length > 0) {
        compacted.officialDomains = cohort.officialDomains;
    }

    if (cohort.preferredDomains && cohort.preferredDomains.length > 0) {
        compacted.preferredDomains = cohort.preferredDomains;
    }

    return compacted;
}

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

interface PostgrestLikeError {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
}

type ScrapeJobInsertType = 'standard' | 'ai_search' | typeof OFFICIAL_BRAND_URL_DISCOVERY_TYPE | typeof OFFICIAL_BRAND_EXTRACTION_TYPE;


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

interface ScraperSiteGroup {
    key: string;
    label: string;
    domain: string | null;
    scrapers: string[];
}

interface BuildChunkPlanOptions {
    skus: string[];
    chunkSize: number;
    scrapers: string[];
    maxRunners?: number;
    scraperConfigs?: ScraperConfig[];
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
        .select('id, brand_name, brand_id, brands(id, name, slug, website_url, official_domains, preferred_domains)')
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

function normalizeSiteGroupLabel(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function toHostname(value: string | undefined): string | null {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).hostname || null;
    } catch {
        return null;
    }
}

function buildScraperSiteGroups(
    scrapers: string[],
    scraperConfigs: ScraperConfig[] = []
): ScraperSiteGroup[] {
    const configBySlug = new Map<string, ScraperConfig>();
    scraperConfigs.forEach((config) => {
        if (config.slug) {
            configBySlug.set(config.slug, config);
        }
    });

    const grouped = new Map<string, ScraperSiteGroup>();

    scrapers.forEach((scraperSlug) => {
        const config = configBySlug.get(scraperSlug);
        const domain =
            toOptionalString(config?.domain)
            ?? toHostname(toOptionalString(config?.base_url))
            ?? null;
        const key = domain ?? scraperSlug;
        const label = domain ?? normalizeSiteGroupLabel(scraperSlug);

        const existing = grouped.get(key);
        if (existing) {
            existing.scrapers.push(scraperSlug);
            return;
        }

        grouped.set(key, {
            key,
            label,
            domain,
            scrapers: [scraperSlug],
        });
    });

    return Array.from(grouped.values()).sort((left, right) => {
        if (left.scrapers.length !== right.scrapers.length) {
            return right.scrapers.length - left.scrapers.length;
        }

        return left.label.localeCompare(right.label);
    });
}

function buildScrapeChunkPlan({
    skus,
    chunkSize,
    scrapers,
    maxRunners,
    scraperConfigs,
}: BuildChunkPlanOptions): PlannedScrapeJob {
    const normalizedChunkSize = Math.max(1, chunkSize);
    const numChunks = Math.ceil(skus.length / normalizedChunkSize);
    const skuSlices: string[][] = [];

    if (numChunks > 0) {
        const baseSize = Math.floor(skus.length / numChunks);
        let remainder = skus.length % numChunks;
        
        let currentIndex = 0;
        for (let i = 0; i < numChunks; i++) {
            const currentChunkSize = baseSize + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            
            skuSlices.push(skus.slice(currentIndex, currentIndex + currentChunkSize));
            currentIndex += currentChunkSize;
        }
    }

    const siteGroups = buildScraperSiteGroups(scrapers, scraperConfigs);
    const effectiveGroups = siteGroups.length > 0
        ? siteGroups
        : [{
            key: 'default',
            label: 'Default',
            domain: null,
            scrapers,
        } satisfies ScraperSiteGroup];

    const normalizedMaxRunners =
        typeof maxRunners === 'number' && Number.isFinite(maxRunners) && maxRunners > 0
            ? Math.max(1, Math.trunc(maxRunners))
            : undefined;

    const chunks: PlannedScrapeChunk[] = [];
    let plannedWorkUnits = 0;

    skuSlices.forEach((skuSlice, sliceIndex) => {
        effectiveGroups.forEach((group) => {
            const plannedUnits = skuSlice.length * Math.max(1, group.scrapers.length);
            plannedWorkUnits += plannedUnits;
            chunks.push({
                chunk_index: chunks.length,
                skus: skuSlice,
                scrapers: group.scrapers,
                planned_work_units: plannedUnits,
                sku_slice_index: sliceIndex,
                site_group_key: group.key,
                site_group_label: group.label,
                site_domain: group.domain,
                scraper_count: group.scrapers.length,
            });
        });
    });

    const metadata: Record<string, unknown> = {
        planning_strategy: 'sku_slices_x_site_groups',
        sku_slice_count: skuSlices.length,
        site_group_count: effectiveGroups.length,
        planned_chunk_count: chunks.length,
        planned_work_units: plannedWorkUnits,
        chunk_size: normalizedChunkSize,
        chunk_grouping: effectiveGroups.map((group) => ({
            key: group.key,
            label: group.label,
            domain: group.domain,
            scraper_count: group.scrapers.length,
            scrapers: group.scrapers,
        })),
    };

    if (normalizedMaxRunners) {
        metadata.max_concurrent_chunks = normalizedMaxRunners;
    }

    return {
        chunks,
        metadata,
        plannedChunkCount: chunks.length,
        plannedWorkUnits,
    };
}

async function loadStandardScrapePlan(
    skus: string[],
    scrapers: string[],
    chunkSize: number,
    maxRunners?: number,
): Promise<PlannedScrapeJob> {
    const scraperConfigs = scrapers.length > 0 ? await getLocalScraperConfigs() : [];
    return buildScrapeChunkPlan({
        skus,
        chunkSize,
        scrapers,
        maxRunners,
        scraperConfigs,
    });
}

async function createScrapeJobChunks(
    supabase: Awaited<ReturnType<typeof createClient>>,
    jobId: string,
    plannedJob: PlannedScrapeJob,
    nowIso: string,
): Promise<{ success: true } | { success: false; error: string }> {
    const chunks = plannedJob.chunks.map((chunk) => ({
        job_id: jobId,
        chunk_index: chunk.chunk_index,
        skus: chunk.skus,
        scrapers: chunk.scrapers,
        status: 'pending',
        updated_at: nowIso,
        sku_slice_index: chunk.sku_slice_index ?? null,
        site_group_key: chunk.site_group_key ?? null,
        site_group_label: chunk.site_group_label ?? null,
        site_domain: chunk.site_domain ?? null,
        planned_work_units: chunk.planned_work_units,
    }));

    const { error } = await supabase
        .from('scrape_job_chunks')
        .insert(chunks);

    if (error) {
        console.error('[Pipeline Scraping] Failed to create work units:', error);
        return { success: false, error: 'Failed to create scraping work units' };
    }

    return { success: true };
}

export async function cloneScrapeJobForRetry(
    supabase: Awaited<ReturnType<typeof createClient>>,
    originalJob: {
        skus?: string[] | null;
        scrapers?: string[] | null;
        test_mode?: boolean | null;
        max_workers?: number | null;
        max_attempts?: number | null;
        type?: string | null;
        config?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
    },
): Promise<{ success: true; jobId: string; plannedChunkCount: number } | { success: false; error: string }> {
    const skus = Array.isArray(originalJob.skus) ? originalJob.skus : [];
    const scrapers = Array.isArray(originalJob.scrapers) ? originalJob.scrapers : [];

    if (skus.length === 0) {
        return { success: false, error: 'Original job has no SKUs to retry' };
    }

    const nowIso = new Date().toISOString();
    const metadata = originalJob.metadata && typeof originalJob.metadata === 'object'
        ? { ...originalJob.metadata }
        : {};
    const chunkSize = typeof metadata.chunk_size === 'number' && Number.isFinite(metadata.chunk_size)
        ? Math.max(1, Math.trunc(metadata.chunk_size))
        : 50;
    const maxConcurrentChunks = typeof metadata.max_concurrent_chunks === 'number' && Number.isFinite(metadata.max_concurrent_chunks)
        ? Math.max(1, Math.trunc(metadata.max_concurrent_chunks))
        : undefined;

    const plannedJob = await loadStandardScrapePlan(
        skus,
        scrapers,
        chunkSize,
        maxConcurrentChunks,
    );

    const mergedMetadata = {
        ...metadata,
        ...plannedJob.metadata,
        retry_source: 'admin_scraper_runs',
    } satisfies Record<string, unknown>;

    const { data: newJob, error: createError } = await supabase
        .from('scrape_jobs')
        .insert({
            skus,
            scrapers,
            test_mode: originalJob.test_mode ?? false,
            max_workers: originalJob.max_workers ?? 3,
            status: 'pending',
            attempt_count: 0,
            max_attempts: originalJob.max_attempts ?? 3,
            type: originalJob.type ?? 'standard',
            config: originalJob.config ?? null,
            metadata: mergedMetadata,
            items_processed: 0,
            items_total: plannedJob.plannedWorkUnits,
            updated_at: nowIso,
        })
        .select('id')
        .single();

    if (createError || !newJob) {
        console.error('[Pipeline Scraping] Failed to create retried job:', createError);
        return { success: false, error: 'Failed to retry scraper run' };
    }

    const chunkResult = await createScrapeJobChunks(supabase, newJob.id, plannedJob, nowIso);
    if (!chunkResult.success) {
        await supabase.from('scrape_jobs').delete().eq('id', newJob.id);
        return chunkResult;
    }

    return {
        success: true,
        jobId: newJob.id,
        plannedChunkCount: plannedJob.plannedChunkCount,
    };
}

export async function buildLinearChunkPlan(
    skus: string[],
    scrapers: string[],
    chunkSize: number,
): Promise<PlannedScrapeJob> {
    const normalizedChunkSize = Math.max(1, chunkSize);
    const numChunks = Math.ceil(skus.length / normalizedChunkSize);
    const chunks: PlannedScrapeChunk[] = [];

    if (numChunks > 0) {
        const baseSize = Math.floor(skus.length / numChunks);
        let remainder = skus.length % numChunks;
        
        let currentIndex = 0;
        for (let sliceIndex = 0; sliceIndex < numChunks; sliceIndex++) {
            const currentChunkSize = baseSize + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            
            const sliceSkus = skus.slice(currentIndex, currentIndex + currentChunkSize);
            chunks.push({
                chunk_index: sliceIndex,
                skus: sliceSkus,
                scrapers,
                planned_work_units: sliceSkus.length,
                sku_slice_index: sliceIndex,
            });
            
            currentIndex += currentChunkSize;
        }
    }

    return {
        chunks,
        metadata: {
            planning_strategy: 'linear_sku_slices',
            sku_slice_count: chunks.length,
            site_group_count: 1,
            planned_chunk_count: chunks.length,
            planned_work_units: skus.length,
            chunk_size: normalizedChunkSize,
        },
        plannedChunkCount: chunks.length,
        plannedWorkUnits: skus.length,
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
            .select('sku, name, brand:brands(name, website_url, official_domains, preferred_domains), product_categories(category:categories(name))')
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

    let brandRegistryLookup: { byId: Map<string, BrandRegistryEntry>; bySlug: Map<string, BrandRegistryEntry>; byAlias: Map<string, BrandRegistryEntry> } = {
        byId: new Map(),
        bySlug: new Map(),
        byAlias: new Map(),
    };
    let cohortBrandEntries = new Map<string, BrandRegistryEntry>();

    if (useBrandRegistryFallback) {
        const brandIds = new Set<string>();
        const brandSlugs = new Set<string>();
        const brandAliases = new Set<string>();
        const cohortIds = new Set<string>();

        if (fallbackBrandHint) {
            const fallbackSlug = brandHintToSlug(fallbackBrandHint);
            if (fallbackSlug) {
                brandSlugs.add(fallbackSlug);
            }
            const fallbackRaw = toOptionalString(fallbackBrandHint);
            if (fallbackRaw) {
                brandAliases.add(fallbackRaw);
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
                const raw = toOptionalString(brandHint);
                if (raw) {
                    brandAliases.add(raw);
                }
            });

            const hasExplicitBrandHint = explicitBrandHints.some((brandHint) => Boolean(toOptionalString(brandHint)));
            if (!hasExplicitBrandHint) {
                getLeadingBrandHintCandidates(row.input?.name).forEach((brandHint) => {
                    const slug = brandHintToSlug(brandHint);
                    if (slug) {
                        brandSlugs.add(slug);
                    }
                    brandAliases.add(brandHint);
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
            brandAliases: Array.from(brandAliases),
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
            brandRegistryLookup.byAlias,
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
        const catalogPreferredDomains = catalogBrandEntry?.preferredDomains ?? getBrandRegistryPreferredDomains(product?.brand);
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

    const maxWorkers = options?.maxWorkers ?? 3;
    const testMode = options?.testMode ?? false;
    const scrapers = options?.scrapers ?? [];
    const maxAttempts = options?.maxAttempts ?? 3;
    const chunkSize = options?.chunkSize ?? 50; // Default 50 SKUs per chunk
    const enrichmentMethod = options?.enrichment_method ?? 'scrapers';
    const isOfficialBrand = enrichmentMethod === 'official_brand';
    const officialBrandPhase = isOfficialBrand
        ? options?.officialBrandPhase ?? 'url_discovery'
        : undefined;
    const isOfficialBrandDiscovery = officialBrandPhase === 'url_discovery';
    const isOfficialBrandExtraction = officialBrandPhase === 'extraction';

    const effectiveScrapersRaw = isOfficialBrand ? ['official_brand'] : scrapers;
    const jobType: ScrapeJobInsertType = isOfficialBrandDiscovery
        ? OFFICIAL_BRAND_URL_DISCOVERY_TYPE
        : isOfficialBrandExtraction
            ? OFFICIAL_BRAND_EXTRACTION_TYPE
            : 'standard';

    // Resolve scraper display names to slugs if possible using local YAML configs
    let effectiveScrapers = effectiveScrapersRaw;
    if (scrapers.length > 0 && !isOfficialBrand) {
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
        preferCatalogContext: isOfficialBrand,
        fallbackBrandHint: options?.cohortBrand,
        useBrandRegistryFallback: isOfficialBrand,
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

    const standardSkuContext = isOfficialBrand ? undefined : buildStandardSkuContext(scrapeContextItems);
    const officialBrandCohort = compactOfficialBrandCohortContext(options?.officialBrandCohort);
    const officialBrandUrlsBySku = isOfficialBrandExtraction ? options?.officialBrandUrlsBySku ?? {} : undefined;

    if (isOfficialBrandExtraction) {
        const missingUrlSkus = skus.filter((sku) => !toOptionalString(officialBrandUrlsBySku?.[sku]));
        if (missingUrlSkus.length > 0) {
            return {
                success: false,
                error: `Official Brand extraction requires a source URL for every SKU. Missing: ${missingUrlSkus.join(', ')}`,
            };
        }

        const invalidUrlSkus = skus.filter((sku) => {
            const url = toOptionalString(officialBrandUrlsBySku?.[sku]);
            return !url || !normalizeOfficialBrandUrl(url);
        });

        if (invalidUrlSkus.length > 0) {
            return {
                success: false,
                error: `Official Brand extraction has invalid source URLs for: ${invalidUrlSkus.join(', ')}`,
            };
        }
    }

    const officialBrandConfigItems = isOfficialBrand
        ? scrapeContextItems.map((item) => {
            const sourceUrl = officialBrandUrlsBySku
                ? toOptionalString(officialBrandUrlsBySku[item.sku])
                : undefined;
            const base: Record<string, unknown> = {
                sku: item.sku,
                register_name: item.register_name,
                brand: item.brand,
                official_domains: item.official_domains,
                preferred_domains: item.preferred_domains,
            };
            if (sourceUrl) {
                base.source_url = sourceUrl;
                base.url_source = 'manual';
            }
            if (isOfficialBrandExtraction && options?.officialBrandMaxFallbacks !== undefined) {
                base.max_fallbacks = options.officialBrandMaxFallbacks;
            }
            return base;
        })
        : undefined;

    const nowIso = new Date().toISOString();

    const plannedStandardJob = !isOfficialBrand
        ? await loadStandardScrapePlan(
            skus,
            effectiveScrapers,
            chunkSize,
            options?.maxRunners,
        )
        : null;

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
        config: isOfficialBrand ? {
            phase: officialBrandPhase,
            ...(officialBrandCohort ? { cohort: officialBrandCohort } : {}),
            items: officialBrandConfigItems ?? [],
        } : (standardSkuContext ? { sku_context: standardSkuContext } : null),
        metadata: isOfficialBrand
            ? {
                source: 'pipeline',
                mode: enrichmentMethod,
                requested_job_type: enrichmentMethod,
                official_brand_phase: officialBrandPhase,
                stored_job_type: type,
            }
            : {
                source: 'pipeline',
                ...(plannedStandardJob?.metadata ?? {}),
            },
        items_processed: 0,
        items_total: isOfficialBrand ? skus.length : plannedStandardJob?.plannedWorkUnits ?? skus.length,
        updated_at: nowIso,
    });

    const { data: job, error: insertError } = await supabase
        .from('scrape_jobs')
        .insert(buildJobInsertPayload(jobType))
        .select('id')
        .single();

    if (insertError || !job) {
        console.error('[Pipeline Scraping] Failed to create parent job:', insertError);
        const errorMessage =
            insertError && typeof insertError === 'object' && 'message' in insertError
                ? String((insertError as { message?: unknown }).message ?? '')
                : JSON.stringify(insertError);
        return { success: false, error: `Failed to create scraping job: ${errorMessage}` };
    }

    const plannedChunks = plannedStandardJob?.plannedChunkCount ?? Math.ceil(skus.length / chunkSize);

    const chunkPlan = !isOfficialBrand
        ? plannedStandardJob
        : await buildLinearChunkPlan(skus, effectiveScrapers, chunkSize);

    const chunkResult = await createScrapeJobChunks(
        supabase,
        job.id,
        chunkPlan ?? {
            chunks: [],
            metadata: {},
            plannedChunkCount: 0,
            plannedWorkUnits: 0,
        },
        nowIso,
    );

    if (!chunkResult.success) {
        await supabase.from('scrape_jobs').delete().eq('id', job.id);
        return { success: false, error: chunkResult.error };
    }

    if (!testMode && isOfficialBrandExtraction && officialBrandUrlsBySku) {
        try {
            const rows = buildManualOfficialBrandCandidateRows({
                urlsBySku: officialBrandUrlsBySku,
                cohort: officialBrandCohort,
                extractionJobId: job.id,
                nowIso,
            });
            await persistOfficialBrandCandidateRows(supabase, rows);
        } catch (candidateError) {
            console.error('[Pipeline Scraping] Failed to persist manual Official Brand URLs:', candidateError);
            await supabase.from('scrape_job_chunks').delete().eq('job_id', job.id);
            await supabase.from('scrape_jobs').delete().eq('id', job.id);
            return { success: false, error: 'Failed to persist Official Brand URL candidates' };
        }
    }

    if (!testMode && !isOfficialBrandDiscovery) {
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

    console.log(`[Pipeline Scraping] Created parent job ${job.id} with ${plannedChunks} chunks (${chunkSize} SKUs per slice)`);

    return {
        success: true,
        jobIds: [job.id],
        plannedChunkCount: plannedChunks,
    };
}
