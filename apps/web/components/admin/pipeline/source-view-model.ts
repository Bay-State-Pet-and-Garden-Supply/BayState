import { normalizeProductSources } from '@/lib/product-sources';
import type { CanonicalProductSourceRecord } from '@/lib/product-sources';

export interface ProcessedSourceViewItem {
    key: string;
    label: string;
    isDefault?: boolean;
    deleteSourceKey?: string;
    data: CanonicalProductSourceRecord | null;
    isEnriched?: boolean;
    isVirtual?: boolean;
}

export function formatPipelineSourceSlug(slug: string): string {
    return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function buildProcessedSourceItems(
    sources: Record<string, unknown>,
    defaultSource?: string
): ProcessedSourceViewItem[] {
    const normalized = normalizeProductSources(sources);
    const items: ProcessedSourceViewItem[] = [];

    for (const [key, value] of Object.entries(normalized)) {
        if (key === '_provenance') continue;

        // Skip sources that were not stocked
        const valRecord = value as Record<string, unknown>;
        if (valRecord?._outcome === 'not_stocked') {
            continue;
        }

        items.push({
            key,
            label: formatPipelineSourceSlug(key),
            isDefault: defaultSource ? key === defaultSource : items.length === 0,
            data: value as CanonicalProductSourceRecord,
            isEnriched: false,
            isVirtual: false,
        });
    }

    // Sort: default first, then alphabetical
    items.sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.label.localeCompare(b.label);
    });

    return items;
}
