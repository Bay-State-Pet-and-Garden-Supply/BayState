type SourceRecord = Record<string, unknown>;

export interface CanonicalProductSourceRecord extends SourceRecord {
    title?: string;
    brand?: string;
    price?: string | number;
    weight?: string | number;
    size?: string | number;
    description?: string;
    images?: string[];
    category?: string;
    categories?: string[];
    product_type?: string;
    ingredients?: string | string[];
    features?: string | string[];
    dimensions?: string;
    specifications?: unknown;
    upc?: string;
    item_number?: string;
    manufacturer_part_number?: string;
    case_pack?: string | number;
    unit_of_measure?: string;
    size_options?: string[];
    url?: string;
    scraped_at?: string;
    source_website?: string;
    confidence?: number;
    ratings?: number;
    reviews_count?: number;
    size_metrics?: Record<string, unknown>;
}

export type ProductSourceMap = Record<string, CanonicalProductSourceRecord>;

const LEGACY_SOURCE_KEY = '_legacy';
const AI_DIAGNOSTIC_ONLY_KEYS = new Set([
    'error',
    'errors',
    'message',
    'cost_usd',
    'llm_cost',
    'total_cost',
    'scraped_at',
    '_scraped_at',
]);
const SOURCE_FIELD_ALIASES: Record<string, string> = {
// Deleted availability alias
    bci_item_number: 'item_number',
    brand: 'brand',
    case_pack: 'case_pack',
    category: 'category',
    categories: 'categories',
    confidence: 'confidence',
    description: 'description',
    dimensions: 'dimensions',
    features: 'features',
    image: 'images',
    image_url: 'images',
    image_urls: 'images',
    images: 'images',
    ingredients: 'ingredients',
    item_number: 'item_number',
    manufacturer_number: 'manufacturer_part_number',
    manufacturer_part_no: 'manufacturer_part_number',
    manufacturer_part_number: 'manufacturer_part_number',
    mfg: 'manufacturer_part_number',
    mfg_no: 'manufacturer_part_number',
    mfg_number: 'manufacturer_part_number',
    name: 'title',
    price: 'price',
    product_name: 'title',
    product_title: 'title',
    product_url: 'url',
    product_type: 'product_type',
    producttype: 'product_type',
    rating: 'ratings',
    ratings: 'ratings',
    review_count: 'reviews_count',
    reviews_count: 'reviews_count',
    scraped_at: 'scraped_at',
    size: 'size',
    size_metrics: 'size_metrics',
    size_options: 'size_options',
    source_website: 'source_website',
    specifications: 'specifications',
    title: 'title',
    uo_m: 'unit_of_measure',
    uom: 'unit_of_measure',
    unit_of_measure: 'unit_of_measure',
    upc: 'upc',
    url: 'url',
    weight: 'weight',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnakeCaseKey(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function normalizeSourceFieldName(key: string): string {
    const snakeCaseKey = toSnakeCaseKey(key);
    return SOURCE_FIELD_ALIASES[snakeCaseKey] ?? snakeCaseKey;
}

function trimStringValue(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] {
    const entries = Array.isArray(value) ? value : [value];

    const normalized = entries
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    return Array.from(new Set(normalized));
}

function normalizeSourceFieldValue(field: string, value: unknown): unknown {
    if (field === 'images' || field === 'categories' || field === 'size_options') {
        return normalizeStringList(value);
    }

    if (typeof value === 'string') {
        return trimStringValue(value);
    }

    return value;
}

function mergeCanonicalFieldValue(
    field: string,
    currentValue: unknown,
    nextValue: unknown
): unknown {
    if (field === 'images' || field === 'categories' || field === 'size_options') {
        return normalizeStringList([
            ...(Array.isArray(currentValue) ? currentValue : []),
            ...(Array.isArray(nextValue) ? nextValue : [nextValue]),
        ]);
    }

    if (isRecord(currentValue) && isRecord(nextValue)) {
        return {
            ...currentValue,
            ...nextValue,
        };
    }

    if (!hasMeaningfulValue(currentValue) && hasMeaningfulValue(nextValue)) {
        return nextValue;
    }

    return currentValue;
}

export function normalizeSourcePayload(sourcePayload: unknown): CanonicalProductSourceRecord {
    if (!isRecord(sourcePayload)) {
        return {};
    }

    const normalized: CanonicalProductSourceRecord = {};

    for (const [key, rawValue] of Object.entries(sourcePayload)) {
        const normalizedKey = normalizeSourceFieldName(key);
        if (!normalizedKey) {
            continue;
        }

        const normalizedValue = normalizeSourceFieldValue(normalizedKey, rawValue);
        if (normalizedValue === undefined) {
            continue;
        }

        if (!(normalizedKey in normalized)) {
            normalized[normalizedKey] = normalizedValue;
            continue;
        }

        normalized[normalizedKey] = mergeCanonicalFieldValue(
            normalizedKey,
            normalized[normalizedKey],
            normalizedValue
        );
    }

    return normalized;
}

function isMetadataKey(key: string): boolean {
    return key.startsWith('_');
}

function isIgnoredDataKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized === 'scraped_at' || normalized === '_scraped_at';
}

function isAiSource(sourceName: string): boolean {
    const normalized = sourceName.toLowerCase();
    return normalized.startsWith('ai_') || normalized === 'ai-search' || normalized === 'ai';
}

function sanitizeAiSourcePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeAiSourcePayload(entry));
    }

    if (!isRecord(value)) {
        return value;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        if (AI_DIAGNOSTIC_ONLY_KEYS.has(normalizedKey)) {
            continue;
        }
        sanitized[key] = sanitizeAiSourcePayload(entry);
    }

    return sanitized;
}

function hasMeaningfulSourcePayload(sourceName: string, sourcePayload: unknown): boolean {
    const payloadToEvaluate = isAiSource(sourceName)
        ? sanitizeAiSourcePayload(sourcePayload)
        : sourcePayload;

    return hasMeaningfulValue(payloadToEvaluate);
}

function hasMeaningfulValue(value: unknown): boolean {
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value);
    }

    if (typeof value === 'boolean') {
        return true;
    }

    if (Array.isArray(value)) {
        return value.some((entry) => hasMeaningfulValue(entry));
    }

    if (isRecord(value)) {
        return Object.entries(value).some(([key, entry]) => {
            if (isIgnoredDataKey(key)) {
                return false;
            }
            return hasMeaningfulValue(entry);
        });
    }

    return false;
}

function isLikelyImageUrl(value: string): boolean {
    const normalized = value.trim();
    if (!(normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/'))) {
        return false;
    }

    if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(normalized)) {
        return true;
    }

    return /(?:image|img|photo|picture|thumbnail|cdn)/i.test(normalized);
}

function isImageDataUri(value: string): boolean {
    return /^data:image\//i.test(value.trim());
}

function isImageLikeKey(key: string): boolean {
    return /image|img|photo|picture|thumbnail|gallery|hero/i.test(key);
}

export function extractSourceMetadata(rawSources: unknown): Record<string, unknown> {
    if (!isRecord(rawSources)) {
        return {};
    }

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawSources)) {
        if (isMetadataKey(key)) {
            metadata[key] = value;
        }
    }

    return metadata;
}

export function normalizeProductSources(rawSources: unknown): ProductSourceMap {
    if (!isRecord(rawSources)) {
        return {};
    }

    const normalized: ProductSourceMap = {};
    const legacyFields: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawSources)) {
        if (isMetadataKey(key)) {
            continue;
        }

        if (isRecord(value)) {
            normalized[key] = normalizeSourcePayload(value);
        } else {
            legacyFields[key] = value;
        }
    }

    if (Object.keys(legacyFields).length > 0) {
        normalized[LEGACY_SOURCE_KEY] = normalizeSourcePayload({
            ...(normalized[LEGACY_SOURCE_KEY] || {}),
            ...legacyFields,
        });
    }

    return normalized;
}

export function mergeProductSources(
    existingRawSources: unknown,
    incomingRawSources: unknown
): Record<string, unknown> {
    const existing = normalizeProductSources(existingRawSources);
    const incoming = normalizeProductSources(incomingRawSources);

    const merged: ProductSourceMap = {
        ...existing,
    };

    for (const [sourceName, sourcePayload] of Object.entries(incoming)) {
        merged[sourceName] = {
            ...(merged[sourceName] || {}),
            ...sourcePayload,
        };
    }

    return {
        ...merged,
        ...extractSourceMetadata(existingRawSources),
        ...extractSourceMetadata(incomingRawSources),
    };
}

export function hasMeaningfulProductSourceData(rawSources: unknown): boolean {
    const normalized = normalizeProductSources(rawSources);
    return Object.entries(normalized).some(([sourceName, sourcePayload]) =>
        hasMeaningfulSourcePayload(sourceName, sourcePayload)
    );
}

export function filterMeaningfulProductSources(rawSources: unknown): ProductSourceMap {
    const normalized = normalizeProductSources(rawSources);

    return Object.fromEntries(
        Object.entries(normalized).filter(([sourceName, sourcePayload]) =>
            hasMeaningfulSourcePayload(sourceName, sourcePayload)
        )
    );
}

export function buildConsolidationSourcesPayload(
    rawSources: unknown,
    rawInput?: unknown
): Record<string, unknown> {
    const normalizedSources = normalizeProductSources(rawSources);
    const payload: Record<string, unknown> = {
        ...normalizedSources,
    };

    if (isRecord(rawInput) && Object.keys(rawInput).length > 0) {
        payload._input = rawInput;
    }

    return payload;
}

export function extractImageCandidatesFromSources(rawSources: unknown, max: number = 24): string[] {
    const normalizedSources = normalizeProductSources(rawSources);
    const deduped = new Set<string>();

    const addCandidate = (candidate: string) => {
        const trimmed = candidate.trim();
        if (!trimmed) {
            return;
        }
        if (isImageDataUri(trimmed)) {
            deduped.add(trimmed);
            return;
        }
        if (!isLikelyImageUrl(trimmed)) {
            return;
        }
        deduped.add(trimmed);
    };

    const visit = (value: unknown, keyPath: string[] = [], depth: number = 0) => {
        if (deduped.size >= max || depth > 6) {
            return;
        }

        const latestKey = keyPath[keyPath.length - 1] || '';
        const imageKeyContext = keyPath.some((key) => isImageLikeKey(key));

        if (typeof value === 'string') {
            if (imageKeyContext || isImageLikeKey(latestKey) || isLikelyImageUrl(value)) {
                addCandidate(value);
            }
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((entry) => visit(entry, keyPath, depth + 1));
            return;
        }

        if (isRecord(value)) {
            Object.entries(value).forEach(([key, entry]) => {
                if (isIgnoredDataKey(key)) {
                    return;
                }
                visit(entry, [...keyPath, key], depth + 1);
            });
        }
    };

    Object.values(normalizedSources).forEach((sourcePayload) => visit(sourcePayload));

    return Array.from(deduped).slice(0, max);
}
