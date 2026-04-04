import { buildFacetSlug, splitMultiValueFacet } from '@/lib/facets/normalization';

export const GENERIC_FACET_FIELDS = {
    ProductField18: {
        name: 'lifestage',
        description: 'Normalized ProductField18 values for life stage filtering.',
    },
    ProductField19: {
        name: 'pet_size',
        description: 'Normalized ProductField19 values for pet size filtering.',
    },
    ProductField20: {
        name: 'special_diet',
        description: 'Normalized ProductField20 values for special diet filtering.',
    },
    ProductField21: {
        name: 'health_feature',
        description: 'Normalized ProductField21 values for health feature filtering.',
    },
    ProductField22: {
        name: 'food_form',
        description: 'Normalized ProductField22 values for food form filtering.',
    },
    ProductField23: {
        name: 'flavor',
        description: 'Normalized ProductField23 values for flavor filtering.',
    },
    ProductField26: {
        name: 'product_feature',
        description: 'Normalized ProductField26 values for product feature filtering.',
    },
    ProductField27: {
        name: 'size',
        description: 'Normalized ProductField27 values for size filtering.',
    },
    ProductField29: {
        name: 'color',
        description: 'Normalized ProductField29 values for color filtering.',
    },
    ProductField30: {
        name: 'packaging_type',
        description: 'Normalized ProductField30 values for packaging type filtering.',
    },
} as const;

export type GenericFacetField = keyof typeof GENERIC_FACET_FIELDS;
export type GenericFacetName = (typeof GENERIC_FACET_FIELDS)[GenericFacetField]['name'];

export type GenericFacetDefinition = {
    name: GenericFacetName;
    slug: string;
    description: string;
};

export type NormalizedGenericFacetValue = {
    value: string;
    normalizedValue: string;
    slug: string;
};

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function toTitleCase(value: string): string {
    return collapseWhitespace(value)
        .split(/(\s+|\/|&|-|\(|\)|,)/)
        .map((segment) => {
            if (!/^[A-Za-z][A-Za-z']*$/.test(segment)) {
                return segment;
            }

            const alpha = segment.replace(/[^A-Za-z]/g, '');
            if (alpha.length > 1 && alpha === alpha.toUpperCase()) {
                return segment;
            }

            return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
        })
        .join('');
}

export function getGenericFacetDefinition(field: GenericFacetField): GenericFacetDefinition {
    const facet = GENERIC_FACET_FIELDS[field];

    return {
        name: facet.name,
        slug: buildFacetSlug(facet.name),
        description: facet.description,
    };
}

export function normalizeGenericFacetToken(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = collapseWhitespace(value);
    if (!normalized) {
        return null;
    }

    return toTitleCase(normalized);
}

export function normalizeGenericFacetValues(value: string | null | undefined): NormalizedGenericFacetValue[] {
    const deduped = new Map<string, NormalizedGenericFacetValue>();

    for (const token of splitMultiValueFacet(value)) {
        const normalizedToken = normalizeGenericFacetToken(token);
        if (!normalizedToken) {
            continue;
        }

        const dedupeKey = normalizedToken.toLowerCase();
        if (deduped.has(dedupeKey)) {
            continue;
        }

        deduped.set(dedupeKey, {
            value: token,
            normalizedValue: normalizedToken,
            slug: buildFacetSlug(normalizedToken),
        });
    }

    return Array.from(deduped.values());
}

export function normalizeGenericFacetValue(value: string | null | undefined): string | null {
    const normalizedValues = normalizeGenericFacetValues(value).map((entry) => entry.normalizedValue);
    return normalizedValues.length > 0 ? normalizedValues.join('|') : null;
}
