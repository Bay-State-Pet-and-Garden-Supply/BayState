import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { runOfficialBrandDiscovery } from '@/lib/official-brand-discovery';
import { createClient } from '@/lib/supabase/server';
import {
    normalizeOfficialBrandUrl,
    officialBrandUrlMatchesDomains,
} from '@/lib/official-brand-workflow';

interface CohortBrandRecord {
    id?: string | null;
    name?: string | null;
    official_domains?: string[] | null;
    preferred_domains?: string[] | null;
}

interface CohortLookupRow {
    id?: string | null;
    brand_id?: string | null;
    brand_name?: string | null;
    brands?: CohortBrandRecord | CohortBrandRecord[] | null;
}

interface ProductIngestionMembershipRow {
    sku?: string | null;
    cohort_id?: string | null;
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
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

function toDomainList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const ordered: string[] = [];
    const seen = new Set<string>();

    value.forEach((entry) => {
        if (typeof entry !== 'string') {
            return;
        }

        const normalized = normalizeDomainCandidate(entry);
        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        ordered.push(normalized);
    });

    return ordered.length > 0 ? ordered : undefined;
}

function toSingleBrandRecord(
    value: CohortBrandRecord | CohortBrandRecord[] | null | undefined,
): CohortBrandRecord | null {
    if (!value) {
        return null;
    }

    return Array.isArray(value) ? value[0] ?? null : value;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const record: Record<string, string> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        const sku = toOptionalString(key);
        const url = toOptionalString(entry);
        if (sku && url) {
            record[sku] = url;
        }
    });

    return Object.keys(record).length > 0 ? record : undefined;
}

/**
 * POST /api/admin/pipeline/scrape
 * Creates scraper jobs for the given SKUs and transitions them to 'scraped' status.
 *
 * Body: {
 *   skus: string[]              — product SKUs to scrape
 *   scrapers: string[]          — scraper slugs to use (empty = all)
 *   enrichment_method?: string  — 'scrapers' | 'ai_search'
 *   testMode?: boolean
 *   cohort_id?: string          — optional cohort ID to resolve brand for context
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, scrapers, enrichment_method, testMode, cohort_id, official_brand_phase, urls_by_sku } = body as {
            skus: string[];
            scrapers: string[];
            enrichment_method?: 'scrapers' | 'official_brand' | 'deep_research';
            testMode?: boolean;
            cohort_id?: string;
            official_brand_phase?: 'url_discovery' | 'extraction';
            urls_by_sku?: Record<string, string>;
        };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        const enrichmentMethod = enrichment_method ?? 'scrapers';

        if (enrichmentMethod !== 'deep_research' && (!scrapers || !Array.isArray(scrapers))) {
            return NextResponse.json({ error: 'Scrapers array is required' }, { status: 400 });
        }


        const manualUrlsBySku = toStringRecord(urls_by_sku);
        const officialBrandPhase = enrichmentMethod === 'official_brand'
            ? official_brand_phase ?? (manualUrlsBySku ? 'extraction' : 'url_discovery')
            : undefined;
        const supabase = await createClient();

        // Resolve cohort brand for context enrichment
        let cohortBrand: string | undefined;
        let officialBrandCohort:
            | {
                id: string;
                brandId: string;
                brandName: string;
                officialDomains?: string[];
                preferredDomains?: string[];
            }
            | undefined;
        let deepResearchCohort:
            | {
                id: string;
                brandId: string;
                brandName: string;
                officialDomains?: string[];
                preferredDomains?: string[];
            }
            | undefined;

        if (cohort_id) {
            const { data: cohort } = await supabase
                .from('cohort_batches')
                .select('id, brand_name, brand_id, brands(id, name, official_domains, preferred_domains)')
                .eq('id', cohort_id)
                .single();

            const cohortRow = cohort as CohortLookupRow | null;
            if (cohortRow) {
                cohortBrand = toOptionalString(cohortRow.brand_name);
                const brandRecord = toSingleBrandRecord(cohortRow.brands);
                if (!cohortBrand) {
                    cohortBrand = toOptionalString(brandRecord?.name);
                }

                if (enrichmentMethod === 'official_brand') {
                    if (!cohortRow.id) {
                        return NextResponse.json(
                            { error: 'Official Brand requires a valid cohort_id' },
                            { status: 400 }
                        );
                    }

                    const brandId = toOptionalString(cohortRow.brand_id) ?? toOptionalString(brandRecord?.id);
                    const brandName = cohortBrand;
                    const officialDomains = toDomainList(brandRecord?.official_domains);
                    const preferredDomains = toDomainList(brandRecord?.preferred_domains);

                    if (!brandId || !brandName) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort to have an assigned registry brand' },
                            { status: 400 }
                        );
                    }

                    if (!officialDomains?.length && !preferredDomains?.length) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort brand to have domain preferences configured' },
                            { status: 400 }
                        );
                    }

                    officialBrandCohort = {
                        id: cohortRow.id,
                        brandId,
                        brandName,
                        ...(officialDomains ? { officialDomains } : {}),
                        ...(preferredDomains ? { preferredDomains } : {}),
                    };
                }

                if (enrichmentMethod === 'deep_research') {
                    const brandId = toOptionalString(cohortRow.brand_id) ?? toOptionalString(brandRecord?.id);
                    const brandName = cohortBrand;
                    const officialDomains = toDomainList(brandRecord?.official_domains);
                    const preferredDomains = toDomainList(brandRecord?.preferred_domains);

                    // Deep Research cohort context is permissive — no strict validation
                    if (cohortRow.id && brandId && brandName) {
                        deepResearchCohort = {
                            id: cohortRow.id,
                            brandId,
                            brandName,
                            ...(officialDomains ? { officialDomains } : {}),
                            ...(preferredDomains ? { preferredDomains } : {}),
                        };
                    }
                }
            }
        }

        if (enrichmentMethod === 'official_brand') {
            if (!cohort_id) {
                return NextResponse.json(
                    { error: 'Official Brand requires a single cohort to be selected' },
                    { status: 400 }
                );
            }

            const { data: productMembershipRows, error: membershipError } = await supabase
                .from('products_ingestion')
                .select('sku, cohort_id')
                .in('sku', skus);

            if (membershipError) {
                console.error('[Pipeline Scrape] Failed to validate cohort membership:', membershipError);
                return NextResponse.json({ error: 'Failed to validate cohort membership' }, { status: 500 });
            }

            const membershipBySku = new Map<string, string>();
            const rows = Array.isArray(productMembershipRows)
                ? (productMembershipRows as ProductIngestionMembershipRow[])
                : [];

            rows.forEach((row) => {
                const sku = toOptionalString(row.sku);
                const membershipCohortId = toOptionalString(row.cohort_id);
                if (sku && membershipCohortId) {
                    membershipBySku.set(sku, membershipCohortId);
                }
            });

            const invalidSkus = skus.filter((sku) => membershipBySku.get(sku) !== cohort_id);
            if (invalidSkus.length > 0) {
                return NextResponse.json(
                    { error: 'Official Brand can only run on products from the selected cohort' },
                    { status: 400 }
                );
            }

            if (!officialBrandCohort) {
                return NextResponse.json(
                    { error: 'Official Brand requires an eligible cohort with configured brand domains' },
                    { status: 400 }
                );
            }

            if (officialBrandPhase === 'extraction') {
                if (!manualUrlsBySku) {
                    return NextResponse.json(
                        { error: 'Official Brand extraction requires urls_by_sku' },
                        { status: 400 }
                    );
                }

                const selectedSkuSet = new Set(skus);
                const extraUrlSkus = Object.keys(manualUrlsBySku).filter((sku) => !selectedSkuSet.has(sku));
                const missingUrlSkus = skus.filter((sku) => !manualUrlsBySku[sku]);
                if (extraUrlSkus.length > 0 || missingUrlSkus.length > 0) {
                    return NextResponse.json(
                        {
                            error: 'Official Brand extraction requires exactly one URL for each selected SKU',
                            missing_skus: missingUrlSkus,
                            extra_skus: extraUrlSkus,
                        },
                        { status: 400 }
                    );
                }

                const allowedDomains = [
                    ...(officialBrandCohort.officialDomains ?? []),
                    ...(officialBrandCohort.preferredDomains ?? []),
                ];
                const invalidUrlSkus: string[] = [];
                const domainMismatchSkus: string[] = [];

                skus.forEach((sku) => {
                    const url = manualUrlsBySku[sku];
                    if (!normalizeOfficialBrandUrl(url)) {
                        invalidUrlSkus.push(sku);
                        return;
                    }

                    if (allowedDomains.length > 0 && !officialBrandUrlMatchesDomains(url, allowedDomains)) {
                        domainMismatchSkus.push(sku);
                    }
                });

                if (invalidUrlSkus.length > 0) {
                    return NextResponse.json(
                        { error: 'Official Brand extraction received invalid URLs', invalid_skus: invalidUrlSkus },
                        { status: 400 }
                    );
                }

                if (domainMismatchSkus.length > 0) {
                    return NextResponse.json(
                        {
                            error: 'Manual Official Brand URLs must match the selected cohort brand domains',
                            invalid_skus: domainMismatchSkus,
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // -------------------------------------------------------------------
        // DEPRECATED: Official Brand URL discovery now runs server-side.
        // Runner-based URL discovery is deprecated; only extraction goes to runner.
        // -------------------------------------------------------------------
        if (officialBrandPhase === 'url_discovery') {
            const discoveryResult = await runOfficialBrandDiscovery({ cohortId: cohort_id!, skus });
            if (!discoveryResult.success) {
                return NextResponse.json({ error: discoveryResult.error }, { status: 500 });
            }
            return NextResponse.json({
                success: true,
                sku_count: discoveryResult.skuCount,
                candidate_count: discoveryResult.candidateCount,
                note: 'URL discovery ran server-side. Extraction not started. Use POST /api/admin/pipeline/official-brand/discover to run discovery standalone.',
            });
        }

        const result = await scrapeProducts(skus, {
            scrapers,
            enrichment_method: enrichmentMethod,
            officialBrandPhase,
            officialBrandUrlsBySku: officialBrandPhase === 'extraction' ? manualUrlsBySku : undefined,
            testMode: testMode ?? false,
            cohortBrand,
            officialBrandCohort,
            ...(enrichmentMethod === 'deep_research' && deepResearchCohort ? { deepResearchCohort } : {}),
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Status transition is handled by the scraper callback when results arrive.
        // Products stay in their current status until meaningful data is delivered.

        return NextResponse.json({
            success: true,
            jobIds: result.jobIds,
            skuCount: skus.length,
            scraperCount: scrapers?.length ?? 0,
        });
    } catch (error) {
        console.error('[Pipeline Scrape] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
