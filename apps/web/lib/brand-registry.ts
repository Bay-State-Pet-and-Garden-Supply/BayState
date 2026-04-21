import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export interface BrandRegistryRow {
    id?: unknown;
    name?: unknown;
    slug?: unknown;
    website_url?: unknown;
    official_domains?: unknown;
    preferred_domains?: unknown;
}

export interface BrandRegistryEntry {
    id?: string;
    name?: string;
    slug?: string;
    preferredDomains?: string[];
}

interface BrandRegistryLookupOptions {
    brandIds?: string[];
    brandSlugs?: string[];
}

interface BrandRegistryLookup {
    byId: Map<string, BrandRegistryEntry>;
    bySlug: Map<string, BrandRegistryEntry>;
}

interface BrandRegistryLookupResponse {
    data: BrandRegistryRow[] | null;
    error: { message?: string } | null;
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const normalized = value
        .map((item) => toOptionalString(item))
        .filter((item): item is string => Boolean(item));

    return normalized.length > 0 ? normalized : undefined;
}

function normalizeDomainCandidate(value: string): string | undefined {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return undefined;
    }

    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        const hostname = parsed.hostname.replace(/^www\./, '').trim();
        return hostname || undefined;
    } catch {
        return trimmed
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/', 1)[0]
            .trim() || undefined;
    }
}

function getSingleBrandRecord(
    value: BrandRegistryRow | BrandRegistryRow[] | null | undefined
): BrandRegistryRow | null {
    if (!value) {
        return null;
    }

    return Array.isArray(value) ? value[0] ?? null : value;
}

export function brandHintToSlug(value: unknown): string | undefined {
    const normalized = toOptionalString(value)
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || undefined;
}

export function getBrandRegistryName(
    value: BrandRegistryRow | BrandRegistryRow[] | null | undefined
): string | undefined {
    const brand = getSingleBrandRecord(value);
    return toOptionalString(brand?.name);
}

export function getBrandRegistryPreferredDomains(
    value: BrandRegistryRow | BrandRegistryRow[] | null | undefined
): string[] | undefined {
    const brand = getSingleBrandRecord(value);
    if (!brand) {
        return undefined;
    }

    const ordered: string[] = [];
    const seen = new Set<string>();

    const pushDomain = (candidate: unknown) => {
        if (typeof candidate !== 'string') {
            return;
        }

        const normalized = normalizeDomainCandidate(candidate);
        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        ordered.push(normalized);
    };

    toStringArray(brand.official_domains)?.forEach(pushDomain);
    pushDomain(brand.website_url);
    toStringArray(brand.preferred_domains)?.forEach(pushDomain);

    return ordered.length > 0 ? ordered : undefined;
}

export function toBrandRegistryEntry(
    value: BrandRegistryRow | BrandRegistryRow[] | null | undefined
): BrandRegistryEntry | undefined {
    const brand = getSingleBrandRecord(value);
    if (!brand) {
        return undefined;
    }

    const id = toOptionalString(brand.id);
    const name = getBrandRegistryName(brand);
    const slug = toOptionalString(brand.slug);
    const preferredDomains = getBrandRegistryPreferredDomains(brand);

    if (!id && !name && !slug && !preferredDomains) {
        return undefined;
    }

    return {
        id,
        name,
        slug,
        preferredDomains,
    };
}

function rememberBrandRegistryEntry(
    entry: BrandRegistryEntry | undefined,
    byId: Map<string, BrandRegistryEntry>,
    bySlug: Map<string, BrandRegistryEntry>
): void {
    if (!entry) {
        return;
    }

    if (entry.id) {
        byId.set(entry.id, entry);
    }

    if (entry.slug) {
        bySlug.set(entry.slug, entry);
    }
}

export async function loadBrandRegistryEntries(
    supabase: SupabaseClient<Database>,
    options: BrandRegistryLookupOptions
): Promise<BrandRegistryLookup> {
    const byId = new Map<string, BrandRegistryEntry>();
    const bySlug = new Map<string, BrandRegistryEntry>();
    const brandIds = Array.from(new Set((options.brandIds ?? []).filter(Boolean)));
    const brandSlugs = Array.from(new Set((options.brandSlugs ?? []).filter(Boolean)));

    const runLookup = async (
        column: 'id' | 'slug',
        values: string[]
    ): Promise<BrandRegistryLookupResponse> => {
        const result = await supabase
            .from('brands')
            .select('id, name, slug, website_url, official_domains, preferred_domains')
            .in(column, values);

        return {
            data: Array.isArray(result.data) ? (result.data as unknown as BrandRegistryRow[]) : null,
            error: result.error ? { message: result.error.message } : null,
        };
    };

    const queries: Array<Promise<BrandRegistryLookupResponse>> = [];
    if (brandIds.length > 0) {
        queries.push(runLookup('id', brandIds));
    }

    if (brandSlugs.length > 0) {
        queries.push(runLookup('slug', brandSlugs));
    }

    const responses = await Promise.all(queries);

    responses.forEach(({ data, error }) => {
        if (error) {
            console.warn('[Brand Registry] Failed to load brand registry entries:', error);
            return;
        }

        (data ?? []).forEach((row) => {
            rememberBrandRegistryEntry(toBrandRegistryEntry(row), byId, bySlug);
        });
    });

    return { byId, bySlug };
}

export function findBrandRegistryByHints(
    hints: Array<string | undefined>,
    bySlug: Map<string, BrandRegistryEntry>
): BrandRegistryEntry | undefined {
    for (const hint of hints) {
        const slug = brandHintToSlug(hint);
        if (!slug) {
            continue;
        }

        const entry = bySlug.get(slug);
        if (entry) {
            return entry;
        }
    }

    return undefined;
}
