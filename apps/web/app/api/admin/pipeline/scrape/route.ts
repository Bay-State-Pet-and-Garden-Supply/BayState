import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

interface CohortBrandRecord {
    id?: string | null;
    name?: string | null;
    website_url?: string | null;
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
        const { skus, scrapers, enrichment_method, testMode, cohort_id } = body as {
            skus: string[];
            scrapers: string[];
            enrichment_method?: 'scrapers' | 'official_brand';
            testMode?: boolean;
            cohort_id?: string;
        };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        if (!scrapers || !Array.isArray(scrapers)) {
            return NextResponse.json({ error: 'Scrapers array is required' }, { status: 400 });
        }

        const enrichmentMethod = enrichment_method ?? 'scrapers';
        const supabase = await createClient();

        // Resolve cohort brand for context enrichment
        let cohortBrand: string | undefined;
        let officialBrandCohort:
            | {
                id: string;
                brandId: string;
                brandName: string;
                websiteUrl?: string;
                officialDomains?: string[];
                preferredDomains?: string[];
            }
            | undefined;

        if (cohort_id) {
            const { data: cohort } = await supabase
                .from('cohort_batches')
                .select('id, brand_name, brand_id, brands(id, name, website_url, official_domains, preferred_domains)')
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
                    const websiteUrl = toOptionalString(brandRecord?.website_url);
                    const officialDomains = (() => {
                        const merged = [
                            ...(Array.isArray(brandRecord?.official_domains) ? brandRecord.official_domains : []),
                            ...(websiteUrl ? [websiteUrl] : []),
                        ];
                        return toDomainList(merged);
                    })();
                    const preferredDomains = toDomainList(brandRecord?.preferred_domains);

                    if (!brandId || !brandName) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort to have an assigned registry brand' },
                            { status: 400 }
                        );
                    }

                    if (!websiteUrl && !officialDomains?.length && !preferredDomains?.length) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort brand to have website or domain preferences configured' },
                            { status: 400 }
                        );
                    }

                    officialBrandCohort = {
                        id: cohortRow.id,
                        brandId,
                        brandName,
                        ...(websiteUrl ? { websiteUrl } : {}),
                        ...(officialDomains ? { officialDomains } : {}),
                        ...(preferredDomains ? { preferredDomains } : {}),
                    };
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
        }

        const result = await scrapeProducts(skus, {
            scrapers,
            enrichment_method: enrichmentMethod,
            testMode: testMode ?? false,
            cohortBrand,
            officialBrandCohort,
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
            scraperCount: scrapers.length,
        });
    } catch (error) {
        console.error('[Pipeline Scrape] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
