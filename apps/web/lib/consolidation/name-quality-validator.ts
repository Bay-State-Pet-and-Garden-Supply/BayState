import { normalizeProductSources } from '@/lib/product-sources';
import { extractSizeFromInputName } from '@/lib/product-variant-parsing';

const FLAVOR_TOKENS = [
    'beef',
    'chicken',
    'lamb',
    'whitefish',
    'salmon',
    'turkey',
    'duck',
    'pork',
    'bacon',
    'peanut butter',
    'cheese',
    'cheddar',
    'vanilla',
    'apple',
    'berry',
    'pumpkin',
    'sweet potato',
];

const QUALIFIER_TOKENS = [
    'mini',
    'small',
    'medium',
    'large',
    'xl',
    'jumbo',
    'giant',
];

const MERCHANDISING_TOKENS_REQUIRING_EVIDENCE = [
    'protein',
];

export interface ProductNameQualityInput {
    upc: string;
    name: string | undefined;
    input: Record<string, unknown>;
    sources: Record<string, unknown>;
    packagingFacets?: Record<string, string>;
    shippingWeight?: string | number | null;
}

export interface ProductNameQualityResult {
    errors: string[];
}

function toText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function normalizeWords(value: string): string {
    return value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeUnitText(value: string): string {
    return value
        .replace(/\b(ounces?|oz)\b\.?/gi, 'oz.')
        .replace(/\b(lbs?|pounds?)\b\.?/gi, 'lb.')
        .replace(/\b(count|ct)\b\.?/gi, 'ct.')
        .replace(/\b(feet|ft)\b\.?/gi, 'ft.')
        .replace(/\b(inches?|in)\b\.?/gi, 'in.')
        .replace(/\b(gallons?|gal)\b\.?/gi, 'gal.')
        .replace(/\b(quarts?|qt)\b\.?/gi, 'qt.')
        .replace(/\b(pints?|pt)\b\.?/gi, 'pt.')
        .replace(/\b(packs?|pk)\b\.?/gi, 'pk.')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSize(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = normalizeUnitText(value)
        .replace(/\b(oz|lb|ct|ft|in|gal|qt|pt|pk)\b(?!\.)/gi, '$1.')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || null;
}

function collectText(value: unknown, parts: string[], depth = 0): void {
    if (depth > 4 || value === null || value === undefined) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value));
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value.slice(0, 30)) {
            collectText(entry, parts, depth + 1);
        }
        return;
    }

    if (typeof value === 'object') {
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (key.toLowerCase().includes('image')) continue;
            parts.push(key);
            collectText(entry, parts, depth + 1);
        }
    }
}

function collectEvidenceText(input: Record<string, unknown>, sources: Record<string, unknown>, packagingFacets?: Record<string, string>): string {
    const parts: string[] = [];
    collectText(input, parts);
    collectText(packagingFacets || {}, parts);

    for (const [sourceName, sourcePayload] of Object.entries(normalizeProductSources(sources))) {
        parts.push(sourceName);
        collectText(sourcePayload, parts);
    }

    return normalizeWords(parts.join(' '));
}

function collectEvidenceUrls(sources: Record<string, unknown>): string[] {
    const urls: string[] = [];
    for (const sourcePayload of Object.values(normalizeProductSources(sources))) {
        if (!sourcePayload || typeof sourcePayload !== 'object') continue;
        const sourceRecord = sourcePayload as Record<string, unknown>;
        for (const key of ['url', 'source_url', '_source_url', '_evidence_url']) {
            const value = sourceRecord[key];
            if (typeof value === 'string' && value.trim()) {
                urls.push(value.trim());
            }
        }
    }
    return urls;
}

function urlSlugText(urls: string[]): string {
    return normalizeWords(
        urls
            .map((url) => {
                try {
                    return new URL(url).pathname;
                } catch {
                    return url;
                }
            })
            .join(' ')
            .replace(/[-_/]+/g, ' '),
    );
}

function tokenPresent(text: string, token: string): boolean {
    const normalizedToken = normalizeWords(token);
    if (!normalizedToken) return false;
    return new RegExp(`(^|\\s)${normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(text);
}

function extractRequiredFlavors(evidenceText: string): string[] {
    return FLAVOR_TOKENS.filter((token) => tokenPresent(evidenceText, token));
}

function extractSourceBackedQualifiers(evidenceText: string): string[] {
    return QUALIFIER_TOKENS.filter((token) => tokenPresent(evidenceText, token));
}

function extractAdvertisedSize(input: Record<string, unknown>, sources: Record<string, unknown>, packagingFacets?: Record<string, string>): string | null {
    const inputName = toText(input.name);
    const inputSize = normalizeSize(extractSizeFromInputName(inputName));
    if (inputSize) return inputSize;

    const facetSize = normalizeSize(packagingFacets?.size);
    if (facetSize) return facetSize;

    const urlSize = collectEvidenceUrls(sources)
        .map((url) => urlSlugText([url]))
        .map((slug) => slug.match(/\b(\d+(?:\.\d+)?)\s*(oz|lb|ct|gal|qt|pt|in|ft|pk)\b/i))
        .find((match): match is RegExpMatchArray => Boolean(match));

    return urlSize ? normalizeSize(`${urlSize[1]} ${urlSize[2]}`) : null;
}

function nameContainsSize(name: string, size: string): boolean {
    const normalizedName = normalizeWords(normalizeUnitText(name));
    const normalizedSize = normalizeWords(normalizeUnitText(size));
    return normalizedName.includes(normalizedSize);
}

function findDuplicateSizeMentions(name: string): string[] {
    const matches = Array.from(name.matchAll(/\b(\d+(?:\.\d+)?)\s*(oz|lb|ct|gal|qt|pt|in|ft|pk)\b\.?/gi));
    const seen = new Map<string, number>();
    for (const match of matches) {
        const key = normalizeWords(normalizeUnitText(`${match[1]} ${match[2]}`));
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    return Array.from(seen.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key);
}

function formatShippingWeightCandidates(value: string | number | null | undefined): string[] {
    const text = toText(value).trim();
    if (!text) return [];

    const numeric = Number.parseFloat(text);
    if (!Number.isFinite(numeric) || numeric <= 0) return [];

    const trimmed = numeric.toFixed(2).replace(/\.0+$/, '').replace(/\.([0-9]*[1-9])0+$/, '.$1');
    return [`${trimmed} lb.`, `${trimmed} lb`, `${trimmed} lbs`];
}

function nameContainsUnsupportedMetricConversion(name: string): boolean {
    return /\b\d+(?:\.\d+)?\s*oz\.?\b.*\(\s*\d+(?:\.\d+)?\s*g\.?\s*\)/i.test(name)
        || /\(\s*\d+(?:\.\d+)?\s*g\.?\s*\).*\b\d+(?:\.\d+)?\s*oz\.?\b/i.test(name);
}

export function validateProductNameQuality(input: ProductNameQualityInput): ProductNameQualityResult {
    const errors: string[] = [];
    const name = toText(input.name).trim();

    if (!name) {
        return { errors: ['product name is empty'] };
    }

    const normalizedName = normalizeWords(name);
    const evidenceText = collectEvidenceText(input.input, input.sources, input.packagingFacets);
    const evidenceWithUrlSlugs = `${evidenceText} ${urlSlugText(collectEvidenceUrls(input.sources))}`.trim();
    const advertisedSize = extractAdvertisedSize(input.input, input.sources, input.packagingFacets);

    const duplicateSizes = findDuplicateSizeMentions(name);
    if (duplicateSizes.length > 0) {
        errors.push(`product name repeats size/unit value(s): ${duplicateSizes.join(', ')}`);
    }

    if (nameContainsUnsupportedMetricConversion(name)) {
        errors.push('product name contains unsupported metric conversion parenthetical');
    }

    if (advertisedSize && !nameContainsSize(name, advertisedSize)) {
        errors.push(`product name is missing advertised size ${advertisedSize}`);
    }

    for (const shippingWeight of formatShippingWeightCandidates(input.shippingWeight)) {
        if (advertisedSize && !nameContainsSize(shippingWeight, advertisedSize) && nameContainsSize(name, shippingWeight)) {
            errors.push(`product name uses shipping weight ${shippingWeight} instead of advertised size ${advertisedSize}`);
            break;
        }
    }

    for (const flavor of extractRequiredFlavors(evidenceWithUrlSlugs)) {
        if (!tokenPresent(normalizedName, flavor)) {
            errors.push(`product name is missing source-supported flavor/variant "${flavor}"`);
        }
    }

    const sourceBackedQualifiers = new Set(extractSourceBackedQualifiers(evidenceWithUrlSlugs));
    for (const qualifier of QUALIFIER_TOKENS) {
        if (tokenPresent(normalizedName, qualifier) && !sourceBackedQualifiers.has(qualifier)) {
            errors.push(`product name includes unsupported qualifier "${qualifier}"`);
        }
    }

    for (const token of MERCHANDISING_TOKENS_REQUIRING_EVIDENCE) {
        if (tokenPresent(normalizedName, token) && !tokenPresent(evidenceWithUrlSlugs, token)) {
            errors.push(`product name includes unsupported merchandising token "${token}"`);
        }
    }

    return { errors };
}
