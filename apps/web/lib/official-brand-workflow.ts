import type { SupabaseClient } from '@supabase/supabase-js';

export const OFFICIAL_BRAND_SOURCE_KEY = 'official_brand';
export const OFFICIAL_BRAND_URL_DISCOVERY_TYPE = 'official_brand_url_discovery';
/** @deprecated Use {@link DIRECT_URL_EXTRACTION_TYPE} instead. */
export const OFFICIAL_BRAND_EXTRACTION_TYPE = 'direct_url_extraction';
export const DIRECT_URL_EXTRACTION_TYPE = 'direct_url_extraction';
export const PRODUCT_URL_EXTRACTION_SOURCE_KEY = 'product_url_extraction';

type OfficialBrandPhase = 'url_discovery' | 'extraction';

interface NormalizedOfficialBrandUrl {
    url: string;
    normalizedUrl: string;
    normalizedDomain: string;
}

interface OfficialBrandCohortLike {
    id?: string;
    brandId?: string;
    brandName?: string;
    officialDomains?: string[];
    preferredDomains?: string[];
}

interface CandidateRowInput {
    sku: string;
    url: string;
    candidateSource: 'serper' | 'manual';
    selectionStatus: 'candidate' | 'selected' | 'rejected' | 'extracted' | 'failed';
    cohort?: OfficialBrandCohortLike;
    confidence?: number | null;
    rank?: number | null;
    title?: string | null;
    snippet?: string | null;
    discoveryJobId?: string | null;
    extractionJobId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
    predictedName?: string | null;
    appearedInPhases?: number[] | null;
    selectionTier?: string | null;
    compositeScore?: number | null;
    nowIso: string;
}

type CandidateRow = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

export function normalizeOfficialBrandDomain(value: string): string | undefined {
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

/**
 * Normalizes a URL or domain string for use as a Google 'site:' operator root.
 * Keeps the path if present (e.g. "domain.com/products") to narrow searches,
 * but removes protocol, 'www.', and trailing slashes.
 */
export function normalizeOfficialBrandSearchRoot(value: string): string | undefined {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return undefined;
    }

    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

    try {
        const url = new URL(withProtocol);
        let host = url.hostname.toLowerCase();
        if (host.startsWith('www.')) {
            host = host.slice(4);
        }

        const path = url.pathname.replace(/\/$/, '');
        return path && path !== '/' ? `${host}${path}` : host;
    } catch {
        // Fallback for malformed strings or simple "domain.com/path" inputs
        return trimmed
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/$/, '')
            ?.trim() || undefined;
    }
}

/**
 * Build a deduplicated, normalized list of domains from multiple source arrays
 * and optional extra domain strings.
 *
 * Each source value is normalized via {@link normalizeOfficialBrandDomain}.
 * Duplicates (after normalization) are removed. Use this instead of ad-hoc
 * domain merging in discovery, review, and extraction paths.
 */
export function buildNormalizedDomainList(
    ...sources: Array<Array<string | undefined | null> | undefined | null>
): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const source of sources) {
        if (!source) continue;
        for (const entry of source) {
            if (!entry) continue;
            const normalized = normalizeOfficialBrandSearchRoot(entry);
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                result.push(normalized);
            }
        }
    }

    return result;
}

export function normalizeOfficialBrandUrl(value: string): NormalizedOfficialBrandUrl | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }

        parsed.hash = '';
        const normalizedDomain = normalizeOfficialBrandDomain(parsed.hostname);
        if (!normalizedDomain) {
            return null;
        }

        return {
            url: parsed.toString(),
            normalizedUrl: parsed.toString().replace(/\/$/, ''),
            normalizedDomain,
        };
    } catch {
        return null;
    }
}

export function officialBrandUrlMatchesDomains(
    url: string,
    domainCandidates: Array<string | undefined> | undefined,
): boolean {
    const searchRoot = normalizeOfficialBrandSearchRoot(url);
    const domain = normalizeOfficialBrandDomain(url);
    if (!searchRoot || !domain || !domainCandidates || domainCandidates.length === 0) {
        return false;
    }

    const configured = domainCandidates
        .map((candidate) => (candidate ? normalizeOfficialBrandSearchRoot(candidate) : undefined))
        .filter((candidate): candidate is string => Boolean(candidate));

    return configured.some((off) => {
        if (off.includes('/')) {
            return searchRoot === off || searchRoot.startsWith(off + '/');
        }
        return domain === off || domain.endsWith(`.${off}`);
    });
}

export function getOfficialBrandPhaseFromJob(job: {
    type?: unknown;
    metadata?: unknown;
    config?: unknown;
}): OfficialBrandPhase | null {
    if (job.type === OFFICIAL_BRAND_URL_DISCOVERY_TYPE) {
        return 'url_discovery';
    }

    if (job.type === DIRECT_URL_EXTRACTION_TYPE) {
        return 'extraction';
    }

    const config = isRecord(job.config) ? job.config : {};
    const metadata = isRecord(job.metadata) ? job.metadata : {};
    const configPhase = toOptionalString(config.phase);
    const metadataPhase = toOptionalString(metadata.official_brand_phase);

    if (configPhase === 'url_discovery' || metadataPhase === 'url_discovery') {
        return 'url_discovery';
    }

    if (configPhase === 'extraction' || metadataPhase === 'extraction') {
        return 'extraction';
    }

    if (metadata.requested_job_type === 'official_brand' || isRecord(config.cohort)) {
        return 'extraction';
    }

    return null;
}

export function isOfficialBrandJobType(type: unknown): boolean {
    return type === OFFICIAL_BRAND_URL_DISCOVERY_TYPE || type === DIRECT_URL_EXTRACTION_TYPE;
}

function buildCandidateRow(input: CandidateRowInput): CandidateRow | null {
    const normalized = normalizeOfficialBrandUrl(input.url);
    if (!normalized) {
        return null;
    }

    return {
        sku: input.sku,
        cohort_id: input.cohort?.id ?? null,
        brand_id: input.cohort?.brandId ?? null,
        url: normalized.url,
        normalized_url: normalized.normalizedUrl,
        normalized_domain: normalized.normalizedDomain,
        candidate_source: input.candidateSource,
        selection_status: input.selectionStatus,
        confidence: input.confidence ?? null,
        rank: input.rank ?? null,
        title: input.title ?? null,
        snippet: input.snippet ?? null,
        discovery_job_id: input.discoveryJobId ?? null,
        extraction_job_id: input.extractionJobId ?? null,
        error_message: input.errorMessage ?? null,
        predicted_name: input.predictedName ?? null,
        appeared_in_phases: input.appearedInPhases ?? null,
        selection_tier: input.selectionTier ?? null,
        composite_score: input.compositeScore ?? null,
        metadata: input.metadata ?? {},
        updated_at: input.nowIso,
    };
}

export function buildManualOfficialBrandCandidateRows(args: {
    urlsBySku: Record<string, string>;
    candidateSourceBySku?: Record<string, 'manual' | 'serper'>;
    cohort?: OfficialBrandCohortLike;
    extractionJobId: string;
    nowIso: string;
}): CandidateRow[] {
    return Object.entries(args.urlsBySku)
        .map(([sku, url]) => {
            const candidateSource = args.candidateSourceBySku?.[sku] ?? 'manual';
            return buildCandidateRow({
                sku,
                url,
                candidateSource,
                selectionStatus: 'selected',
                cohort: args.cohort,
                extractionJobId: args.extractionJobId,
                metadata: {
                    source: candidateSource === 'manual'
                        ? 'manual_url_mode'
                        : 'official_brand_review_selection',
                },
                nowIso: args.nowIso,
            });
        })
        .filter((row): row is CandidateRow => Boolean(row));
}

export function buildDiscoveryOfficialBrandCandidateRows(args: {
    jobId: string | null;
    resultsBySku: Record<string, Record<string, unknown>>;
    cohort?: OfficialBrandCohortLike;
    nowIso: string;
}): CandidateRow[] {
    const rows: CandidateRow[] = [];

    Object.entries(args.resultsBySku).forEach(([sku, sources]) => {
        const source = isRecord(sources[OFFICIAL_BRAND_SOURCE_KEY])
            ? sources[OFFICIAL_BRAND_SOURCE_KEY] as Record<string, unknown>
            : null;
        if (!source) {
            return;
        }

        const selectedUrl = toOptionalString(source.selected_url) ?? toOptionalString(source.url);
        const selectedNormalized = selectedUrl ? normalizeOfficialBrandUrl(selectedUrl) : null;
        const rawCandidates = Array.isArray(source.candidates) ? source.candidates : [];
        const candidateRows = rawCandidates
            .map((candidate, index) => {
                const candidateRecord = isRecord(candidate) ? candidate : {};
                const candidateUrl = toOptionalString(candidateRecord.url);
                if (!candidateUrl) {
                    return null;
                }

                const normalized = normalizeOfficialBrandUrl(candidateUrl);
                if (!normalized) {
                    return null;
                }

                const isSelected = Boolean(
                    selectedNormalized && normalized.normalizedUrl === selectedNormalized.normalizedUrl,
                );

                return buildCandidateRow({
                    sku,
                    url: candidateUrl,
                    candidateSource: 'serper',
                    selectionStatus: isSelected ? 'selected' : 'candidate',
                    cohort: args.cohort,
                    confidence: toOptionalNumber(candidateRecord.confidence),
                    rank: toOptionalNumber(candidateRecord.rank) ?? index + 1,
                    title: toOptionalString(candidateRecord.title) ?? null,
                    snippet: toOptionalString(candidateRecord.snippet) ?? toOptionalString(candidateRecord.description) ?? null,
                    discoveryJobId: args.jobId,
                    metadata: {
                        result_type: toOptionalString(candidateRecord.result_type),
                        selection_method: toOptionalString(candidateRecord.selection_method),
                    },
                    predictedName: toOptionalString(source.predicted_name) ?? null,
                    appearedInPhases: Array.isArray(candidateRecord.appeared_in_phases)
                        ? candidateRecord.appeared_in_phases
                        : null,
                    selectionTier: toOptionalString(candidateRecord.selection_tier) ?? null,
                    compositeScore: toOptionalNumber(candidateRecord.composite_score) ?? null,
                    nowIso: args.nowIso,
                });
            })
            .filter((row): row is CandidateRow => Boolean(row));

        rows.push(...candidateRows);

        if (selectedUrl && selectedNormalized && !candidateRows.some((row) => row.normalized_url === selectedNormalized.normalizedUrl)) {
            const selectedRow = buildCandidateRow({
                sku,
                url: selectedUrl,
                candidateSource: 'serper',
                selectionStatus: 'selected',
                cohort: args.cohort,
                confidence: toOptionalNumber(source.confidence),
                discoveryJobId: args.jobId,
                metadata: { source_status: toOptionalString(source.status) },
                predictedName: toOptionalString(source.predicted_name) ?? null,
                nowIso: args.nowIso,
            });

            if (selectedRow) {
                rows.push(selectedRow);
            }
        }
    });

    return rows;
}

export function buildExtractedOfficialBrandCandidateRows(args: {
    jobId: string;
    resultsBySku: Record<string, Record<string, unknown>>;
    config?: Record<string, unknown>;
    nowIso: string;
}): CandidateRow[] {
    const cohort = isRecord(args.config?.cohort)
        ? args.config?.cohort as OfficialBrandCohortLike
        : undefined;
    const itemSourceBySku = new Map<string, 'manual' | 'serper'>();
    const items = Array.isArray(args.config?.items) ? args.config?.items : [];

    items.forEach((item) => {
        if (!isRecord(item)) {
            return;
        }
        const sku = toOptionalString(item.sku);
        if (!sku) {
            return;
        }
        const urlSource = item.url_source === 'manual' ? 'manual' : 'serper';
        itemSourceBySku.set(sku, urlSource);
    });

    return Object.entries(args.resultsBySku)
        .map(([sku, sources]) => {
            const source = isRecord(sources[PRODUCT_URL_EXTRACTION_SOURCE_KEY])
                ? sources[PRODUCT_URL_EXTRACTION_SOURCE_KEY] as Record<string, unknown>
                : isRecord(sources[OFFICIAL_BRAND_SOURCE_KEY])
                    ? sources[OFFICIAL_BRAND_SOURCE_KEY] as Record<string, unknown>
                    : null;
            const url = source ? toOptionalString(source.url) ?? toOptionalString(source.source_website) : undefined;
            if (!url) {
                return null;
            }

            return buildCandidateRow({
                sku,
                url,
                candidateSource: itemSourceBySku.get(sku) ?? 'serper',
                selectionStatus: 'extracted',
                cohort,
                confidence: source ? toOptionalNumber(source.confidence) : undefined,
                extractionJobId: args.jobId,
                metadata: { source: 'official_brand_extraction_callback' },
                nowIso: args.nowIso,
            });
        })
        .filter((row): row is CandidateRow => Boolean(row));
}

export async function persistOfficialBrandCandidateRows(
    supabase: SupabaseClient,
    rows: CandidateRow[],
): Promise<number> {
    if (rows.length === 0) {
        return 0;
    }

    const { error } = await supabase
        .from('official_brand_url_candidates')
        .upsert(rows, { onConflict: 'sku,normalized_url' });

    if (error) {
        throw new Error(`Failed to persist Official Brand URL candidates: ${error.message}`);
    }

    return rows.length;
}
