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

import { buildApprovedSourcePlans, resolveProfileSnapshots } from '@/lib/approved-sources/source-plan';
import type {
    ScrapeOptions,
    ScrapeResult
} from './pipeline-scraping-types';

export type { ScrapeOptions } from './pipeline-scraping-types';



interface PipelineInputRow {
    upc: string;
    brand_id?: unknown;
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
    upc?: string | null;
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
    upc: string;
    product_name?: string;
    register_name?: string;
    price?: number;
    brand?: string;
    category?: string;
    preferred_domains?: string[];
    official_domains?: string[];
}

function compactScrapeContextItem(item: ScrapeContextItem): ScrapeContextItem {
    const compacted: ScrapeContextItem = {
        upc: item.upc,
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
    upcs: string[],
    jobMode: string,
    jobModel: string | null,
): Promise<{ success: true } | { success: false; error: string }> {
    const attempts = upcs.map((upc) => ({
        job_id: jobId,
        upc,
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
        upcs?: string[] | null;
        mode?: string | null;
        model?: string | null;
        config?: Record<string, unknown> | null;
    },
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
    const upcs = Array.isArray(originalJob.upcs) ? originalJob.upcs : [];

    if (upcs.length === 0) {
        return { success: false, error: 'Original job has no UPCs to retry' };
    }

    const nowIso = new Date().toISOString();
    const jobMode = originalJob.mode ?? 'mixed';
    const jobModel = originalJob.model ?? null;

    const { data: newJob, error: createError } = await supabase
        .from('enrichment_jobs')
        .insert({
            status: 'queued',
            upcs,
            total_count: upcs.length,
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
        upcs,
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
    upcs: string[],
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
            .select('upc, brand_id, consolidated, input')
            .in('upc', upcs),
        supabase
            .from('products')
            .select('upc, name, brand:brands(name, official_domains, preferred_domains), product_categories(category:categories(name))')
            .in('upc', upcs),
    ]);

    if (ingestionError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products_ingestion:', ingestionError);
    }

    if (productError) {
        console.warn('[Pipeline Scraping] Failed to load scrape context from products:', productError);
    }

    const ingestionRows = Array.isArray(ingestionData) ? (ingestionData as PipelineInputRow[]) : [];
    const ingestionByUpc = new Map(ingestionRows.map((row) => [row.upc, row]));

    const productRows = Array.isArray(productData) ? (productData as ProductCatalogRow[]) : [];
    const productByUpc = new Map<string, ProductCatalogRow>();
    productRows.forEach((row) => {
        const rowUpc = toOptionalString(row.upc);
        if (rowUpc) {
            productByUpc.set(rowUpc, row);
        }
    });

    let brandRegistryLookup: { byId: Map<string, BrandRegistryEntry>; bySlug: Map<string, BrandRegistryEntry> } = {
        byId: new Map(),
        bySlug: new Map(),
    };

    if (useBrandRegistryFallback) {
        const brandIds = new Set<string>();
        const brandSlugs = new Set<string>();

        if (fallbackBrandHint) {
            const fallbackSlug = brandHintToSlug(fallbackBrandHint);
            if (fallbackSlug) {
                brandSlugs.add(fallbackSlug);
            }
        }

        ingestionRows.forEach((row) => {
            const consolidated = row.consolidated;
            const directBrandId = toOptionalString(row.brand_id);
            const consolidatedBrandId = toOptionalString(consolidated?.brand_id);
            const brandId = directBrandId ?? consolidatedBrandId;
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

        });

        brandRegistryLookup = await loadBrandRegistryEntries(supabase, {
            brandIds: Array.from(brandIds),
            brandSlugs: Array.from(brandSlugs),
        });
    }

    return upcs.map((upc) => {
        const ingestion = ingestionByUpc.get(upc);
        const input = ingestion?.input ?? null;
        const product = productByUpc.get(upc);
        const catalogBrandEntry = getCatalogBrandEntry(product?.brand);
        const directBrandId = toOptionalString(ingestion?.brand_id);
        const consolidatedBrandId = toOptionalString(ingestion?.consolidated?.brand_id);
        const registryBrandId = directBrandId ?? consolidatedBrandId;
        const nameDerivedBrandHints = getLeadingBrandHintCandidates(input?.name);
        const registryBrandById = registryBrandId
            ? brandRegistryLookup.byId.get(registryBrandId)
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
        const resolvedBrandEntry = catalogBrandEntry
            ?? registryBrandById
            ?? registryBrandByHint;

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
        );
        const resolvedPreferredDomains = mergePreferredDomains(
            catalogBrandEntry?.preferredDomains,
            registryBrandById?.preferredDomains,
            registryBrandByHint?.preferredDomains,
        );

        return compactScrapeContextItem({
            upc,
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

type StandardUpcContext = {
    product_name?: string;
    price?: number;
    brand?: string;
    category?: string;
};

function buildStandardUpcContext(items: ScrapeContextItem[]): Record<string, StandardUpcContext> | undefined {
    const upcContextEntries: Array<readonly [string, StandardUpcContext]> = [];

    items.forEach((item) => {
        const context: StandardUpcContext = {
            product_name: item.product_name,
            price: item.price,
            brand: item.brand,
            category: item.category,
        };

        const hasContext = Object.values(context).some((value) => value !== undefined);
        if (hasContext) {
            upcContextEntries.push([item.upc, context]);
        }
    });

    if (upcContextEntries.length === 0) {
        return undefined;
    }

    return Object.fromEntries(upcContextEntries);
}

export async function scrapeProducts(
    upcs: string[],
    options?: ScrapeOptions
): Promise<ScrapeResult> {
    if (!upcs || upcs.length === 0) {
        return { success: false, error: 'No UPCs provided' };
    }

    const testMode = options?.testMode ?? false;
    const retryMode = options?.retryMode ?? 'all';
    const serpDiscoveryEnabled = options?.serpDiscoveryEnabled ?? true;
    const upcResolutionV2Enabled = options?.upcResolutionV2Enabled ?? false;

    const supabase = await createClient();

    // Build Approved Source Plans using the automated cascade
    const sourcePlansByUpc: Record<string, any> = {};
    let sourcePlansByUpcRaw: Record<string, any> = {};  // Keep SourcePlanResult wrappers for resolveProfileSnapshots
    const skippedDetails: Array<{ upc: string; reason: string }> = [];
    try {
        const plans = await buildApprovedSourcePlans(supabase, upcs, {
            retryMode,
            serpDiscoveryEnabled,
            upcResolutionV2Enabled,
        });

        sourcePlansByUpcRaw = plans;

        for (const [upc, result] of Object.entries(plans)) {
            if (result.ok) {
                sourcePlansByUpc[upc] = result.plan;
            } else {
                const reason = result.code
                    ? `${result.code}: ${result.error}`
                    : result.error || 'Unknown error building source plan';
                skippedDetails.push({ upc, reason });
                console.warn(`[Pipeline Scraping] Skipping UPC ${upc}: ${reason}`);
            }
        }
    } catch (e) {
        console.error('[Pipeline Scraping] Failed to build approved source plans:', e);
        return { success: false, error: 'Failed to build approved source plans: ' + (e instanceof Error ? e.message : String(e)) };
    }

    const brandedUpcs = Object.keys(sourcePlansByUpc);
    if (brandedUpcs.length === 0) {
        return {
            success: false,
            error: 'No valid approved source plans could be built for the selected UPCs. Assign a brand with an enabled source cascade in Brand Settings.',
            skippedUpcs: skippedDetails,
        };
    }

    const scrapeContextItems = await loadScrapeContextItems(supabase, brandedUpcs, {});
    const standardUpcContext = buildStandardUpcContext(scrapeContextItems);
    const nowIso = new Date().toISOString();

    const jobMode = 'mixed';
    const jobModel = null;
    const retryModeLabel = retryMode === 'failed_or_untried' ? ' (incremental retry)' : '';
    const cascadeVersion = upcResolutionV2Enabled ? 'v2' : 'v1';
    const jobConfig: Record<string, unknown> = {
        upc_context: standardUpcContext,
        test_mode: testMode,
        source: 'pipeline',
        pipeline_version: 'cascade_v1',
        source_type: 'approved_source_extraction',
        source_plans_by_upc: sourcePlansByUpc,
        cascade_version: cascadeVersion,
        retry_mode: retryMode,
        job_label: `Source Cascade${retryModeLabel}`,
        serp_fallback_policy: serpDiscoveryEnabled
          ? 'run_when_all_distributors_clean_not_stocked'
          : 'disabled',
    };

    // ---- Site Extraction Profile snapshots (behind feature flag) ----
    const siteExtractionProfilesEnabled = process.env.SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED === "true";
    if (siteExtractionProfilesEnabled) {
      const profileSnapshots = await resolveProfileSnapshots(supabase, sourcePlansByUpcRaw);
      if (Object.keys(profileSnapshots).length > 0) {
        jobConfig.profile_snapshots = profileSnapshots;
        console.log(
          `[Pipeline Scraping] Embedded ${Object.keys(profileSnapshots).length} profile snapshot(s) in job config`,
        );
      }
    }

    // When V2 is enabled, add UPC resolution policy flags to job config
    if (upcResolutionV2Enabled) {
        jobConfig.upc_resolution_policy = 'proof_required';
        jobConfig.upc_resolution_v2 = true;
        // In V2 mode, serp_fallback_policy is replaced by staged cascade.
        // The executor reads upc_resolution_v2 and applies stage routing.
        // Keep serp_fallback_policy for backward compat but mark as migrated.
        jobConfig.serp_fallback_policy = 'migrated_to_staged_cascade';
    }

    const { data: job, error: insertError } = await supabase
        .from('enrichment_jobs')
        .insert({
            status: 'queued',
            upcs: brandedUpcs,
            total_count: brandedUpcs.length,
            completed_count: 0,
            failed_count: 0,
            mode: jobMode,
            model: jobModel,
            config: jobConfig,
            items_processed: 0,
            items_total: brandedUpcs.length,
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

    // Create enrichment attempts with the approved_source_extraction sentinel
    const attempts = brandedUpcs.map((upc) => ({
        job_id: job.id,
        upc,
        attempt_number: 1,
        status: 'queued' as const,
        mode: jobMode,
        model: jobModel,
        source_url: 'approved_source_extraction', // Sentinel — runner knows to use source plan
    }));

    const { error: attemptsError } = await supabase
        .from('enrichment_attempts')
        .insert(attempts);

    if (attemptsError) {
        console.error('[Pipeline Scraping] Failed to create enrichment attempts:', attemptsError);
        await supabase.from('enrichment_jobs').delete().eq('id', job.id);
        return { success: false, error: `Failed to create enrichment attempts: ${attemptsError.message}` };
    }

    if (!testMode) {
        // Transition eligible UPCs to extracting based on their current status
        // The requestedFromStatus option controls which UPCs are eligible.
        // Default behavior: transition all branded UPCs to extracting.
        const { data: existingProducts } = await supabase
            .from('products_ingestion')
            .select('upc, pipeline_status')
            .in('upc', brandedUpcs);

        // Statuses eligible for transition to extracting
        const eligibleStatuses = ['imported', 'processed', 'needs_attention', 'extracting'];

        const transitionUpcs = (existingProducts ?? [])
            .filter((p: { upc: string; pipeline_status: string }) =>
                eligibleStatuses.includes(p.pipeline_status))
            .map((p: { upc: string }) => p.upc);

        if (transitionUpcs.length > 0) {
            const { error: statusError } = await supabase
                .from('products_ingestion')
                .update({
                    pipeline_status: 'extracting',
                    updated_at: new Date().toISOString(),
                    error_message: null,
                })
                .in('upc', transitionUpcs);

            if (statusError) {
                console.error('[Pipeline Scraping] Failed to move products into extracting:', statusError);
                await supabase.from('enrichment_attempts').delete().eq('job_id', job.id);
                await supabase.from('enrichment_jobs').delete().eq('id', job.id);
                return { success: false, error: 'Failed to mark products as extracting' };
            }
        }
    }

    console.log(`[Pipeline Scraping] Created enrichment job ${job.id} for ${brandedUpcs.length} UPCs`);

    return {
        success: true,
        jobIds: [job.id],
        skippedUpcs: skippedDetails.length > 0 ? skippedDetails : undefined,
    };
}
