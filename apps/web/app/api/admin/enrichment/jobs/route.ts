import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts, ScrapeOptions } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

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

export const dynamic = 'force-dynamic';

interface EnrichmentJobRequest {
    skus: string[];
    method: 'scrapers' | 'official_brand' | 'crawl4ai';
    cohort_id?: string;
    config?: {
        scrapers?: string[];
        crawl4ai?: {
            extraction_strategy?: 'llm' | 'llm_free' | 'auto';
            cache_enabled?: boolean;
            llm_provider?: 'openai';
            llm_model?: string;
            llm_base_url?: string | null;
            max_retries?: number;
            timeout?: number;
        };
    };
    chunkSize?: number;
    maxWorkers?: number;
    maxRunners?: number;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
        return auth.response;
    }

    try {
        const body = (await request.json()) as EnrichmentJobRequest;

        if (!body.skus || !Array.isArray(body.skus) || body.skus.length === 0) {
            return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 });
        }

        const validMethods = ['scrapers', 'official_brand', 'crawl4ai'];
        if (!body.method || !validMethods.includes(body.method)) {
            return NextResponse.json(
                { error: `method must be one of: ${validMethods.join(', ')}` },
                { status: 400 }
            );
        }

        const normalizedMethod: ScrapeOptions['enrichment_method'] =
            body.method === 'scrapers' ? 'scrapers' : 'official_brand';
        const supabase = await createClient();

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

        if (body.cohort_id) {
            const { data: cohort } = await supabase
                .from('cohort_batches')
                .select('id, brand_name, brand_id, brands(id, name, official_domains, preferred_domains)')
                .eq('id', body.cohort_id)
                .single();

            const cohortRow = cohort as CohortLookupRow | null;
            if (cohortRow) {
                cohortBrand = toOptionalString(cohortRow.brand_name);
                const brandRecord = toSingleBrandRecord(cohortRow.brands);

                if (!cohortBrand) {
                    cohortBrand = toOptionalString(brandRecord?.name);
                }

                if (normalizedMethod === 'official_brand') {
                    if (!cohortRow.id) {
                        return NextResponse.json(
                            { error: 'Official Brand requires a valid cohort_id' },
                            { status: 400 },
                        );
                    }

                    const brandId = toOptionalString(cohortRow.brand_id) ?? toOptionalString(brandRecord?.id);
                    const brandName = cohortBrand;
                    const officialDomains = toDomainList(brandRecord?.official_domains);
                    const preferredDomains = toDomainList(brandRecord?.preferred_domains);

                    if (!brandId || !brandName) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort to have an assigned registry brand' },
                            { status: 400 },
                        );
                    }

                    if (!officialDomains?.length && !preferredDomains?.length) {
                        return NextResponse.json(
                            { error: 'Official Brand requires the cohort brand to have domain preferences configured' },
                            { status: 400 },
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
            }
        }

        if (normalizedMethod === 'official_brand') {
            if (!body.cohort_id) {
                return NextResponse.json(
                    { error: 'Official Brand requires a single cohort to be selected' },
                    { status: 400 },
                );
            }

            const { data: productMembershipRows, error: membershipError } = await supabase
                .from('products_ingestion')
                .select('sku, cohort_id')
                .in('sku', body.skus);

            if (membershipError) {
                console.error('[Enrichment Jobs API] Failed to validate cohort membership:', membershipError);
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

            const invalidSkus = body.skus.filter((sku) => membershipBySku.get(sku) !== body.cohort_id);
            if (invalidSkus.length > 0) {
                return NextResponse.json(
                    { error: 'Official Brand can only run on products from the selected cohort' },
                    { status: 400 },
                );
            }

            if (!officialBrandCohort) {
                return NextResponse.json(
                    { error: 'Official Brand requires an eligible cohort with configured brand domains' },
                    { status: 400 },
                );
            }
        }

        const scrapeOptions: ScrapeOptions = {
            enrichment_method: normalizedMethod,
            chunkSize: body.chunkSize,
            maxWorkers: body.maxWorkers,
            maxRunners: body.maxRunners,
            cohortBrand,
            officialBrandCohort,
        };

        if (body.method === 'scrapers' && body.config?.scrapers) {
            scrapeOptions.scrapers = body.config.scrapers;
        }

        const result = await scrapeProducts(body.skus, scrapeOptions);

        if (!result.success || !result.jobIds || result.jobIds.length === 0) {
            return NextResponse.json(
                { error: result.error || 'Failed to create enrichment job' },
                { status: 500 }
            );
        }

        const jobId = result.jobIds[0];
        const chunkCount =
            typeof result.plannedChunkCount === 'number'
                ? result.plannedChunkCount
                : Math.ceil(body.skus.length / (body.chunkSize ?? 50));

        return NextResponse.json({
            jobId,
            chunkCount,
            statusUrl: `/admin/scrapers/runs/${jobId}`,
        });
    } catch (error: unknown) {
        console.error('[Enrichment Jobs API] Request failed:', error);

        if (error instanceof Error && error.message.includes('JSON')) {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
