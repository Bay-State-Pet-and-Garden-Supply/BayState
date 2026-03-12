type SourceRecord = Record<string, unknown>;

export type ProductSourceMap = Record<string, SourceRecord>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
            normalized[key] = value;
        } else {
            legacyFields[key] = value;
        }
    }

    if (Object.keys(legacyFields).length > 0) {
        normalized[LEGACY_SOURCE_KEY] = {
            ...(normalized[LEGACY_SOURCE_KEY] || {}),
            ...legacyFields,
        };
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
