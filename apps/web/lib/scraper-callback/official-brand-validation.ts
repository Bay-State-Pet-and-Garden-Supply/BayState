interface OfficialBrandCohortConfig {
    officialDomains?: string[];
    preferredDomains?: string[];
}

interface OfficialBrandValidationResult {
    accepted: boolean;
    reason?: string;
}

interface OfficialBrandFilterResult {
    acceptedResults: Record<string, Record<string, unknown>>;
    rejectedBySku: Record<string, string>;
    acceptedCount: number;
    rejectedCount: number;
}

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

function toDomainSet(config?: OfficialBrandCohortConfig): Set<string> {
    const domains = [
        ...(Array.isArray(config?.officialDomains) ? config.officialDomains : []),
        ...(Array.isArray(config?.preferredDomains) ? config.preferredDomains : []),
    ];

    const normalized = domains
        .map((value) => normalizeDomainCandidate(value))
        .filter((value): value is string => Boolean(value));

    return new Set(normalized);
}

function hasProductSignal(source: Record<string, unknown>): boolean {
    const title = toOptionalString(source.title);
    const description = toOptionalString(source.description);
    const brand = toOptionalString(source.brand);
    const categories = Array.isArray(source.categories) ? source.categories.filter((entry) => typeof entry === 'string' && entry.trim()) : [];
    const images = Array.isArray(source.images) ? source.images.filter((entry) => typeof entry === 'string' && entry.trim()) : [];

    return Boolean(title || description || brand || categories.length > 0 || images.length > 0 || isRecord(source.specifications) || Array.isArray(source.features));
}

function toConfidence(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function domainMatchesConfigured(sourceUrl: string, configuredDomains: Set<string>): boolean {
    const domain = normalizeDomainCandidate(sourceUrl);
    if (!domain) {
        return false;
    }

    return Array.from(configuredDomains).some((configured) => domain === configured || domain.endsWith(`.${configured}`));
}

export function validateOfficialBrandSourceForPersistence(
    source: unknown,
    cohortConfig?: OfficialBrandCohortConfig,
): OfficialBrandValidationResult {
    if (!isRecord(source)) {
        return { accepted: false, reason: 'Official Brand source payload is missing' };
    }

    const url = toOptionalString(source.url);
    const sourceWebsite = toOptionalString(source.source_website);
    const brand = toOptionalString(source.brand);

    if (!url || !sourceWebsite || !brand) {
        return { accepted: false, reason: 'Official Brand result missing required url/source_website/brand fields' };
    }

    if (!hasProductSignal(source)) {
        return { accepted: false, reason: 'Official Brand result missing product content signals' };
    }

    const confidence = toConfidence(source.confidence);
    if (confidence === null || confidence < 0.8) {
        return { accepted: false, reason: 'Official Brand confidence below threshold' };
    }

    const configuredDomains = toDomainSet(cohortConfig);
    if (configuredDomains.size > 0 && !domainMatchesConfigured(sourceWebsite, configuredDomains)) {
        return { accepted: false, reason: 'Official Brand domain did not match configured cohort domains' };
    }

    return { accepted: true };
}

export function filterOfficialBrandResultsForPersistence(
    resultsBySku: Record<string, Record<string, unknown>>,
    cohortConfig?: OfficialBrandCohortConfig,
): OfficialBrandFilterResult {
    const acceptedResults: Record<string, Record<string, unknown>> = {};
    const rejectedBySku: Record<string, string> = {};

    Object.entries(resultsBySku).forEach(([sku, sources]) => {
        const validation = validateOfficialBrandSourceForPersistence(sources.official_brand, cohortConfig);
        if (validation.accepted) {
            acceptedResults[sku] = sources;
            return;
        }

        rejectedBySku[sku] = validation.reason || 'Official Brand result not consolidation-ready';
    });

    return {
        acceptedResults,
        rejectedBySku,
        acceptedCount: Object.keys(acceptedResults).length,
        rejectedCount: Object.keys(rejectedBySku).length,
    };
}
