const PRODUCT_TYPE_CORRECTIONS: Record<string, string> = {
    apparrel: 'Apparel',
    'beeding & litter': 'Bedding & Litter',
    'vitsamins & supplements': 'Vitamins & Supplements',
};

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function dedupeValues(values: string[]): string[] {
    return Array.from(new Set(values));
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

export function buildFacetSlug(name: string): string {
    return collapseWhitespace(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function splitMultiValueFacet(value: string | null | undefined): string[] {
    if (!value) {
        return [];
    }

    return value
        .split('|')
        .map((part) => collapseWhitespace(part))
        .filter(Boolean);
}

export function normalizeBrandName(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = collapseWhitespace(value);
    return normalized.length > 0 ? normalized : null;
}

export function normalizeCategoryName(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = collapseWhitespace(value);
    if (!normalized) {
        return null;
    }

    return toTitleCase(normalized);
}

export function normalizeCategoryValue(value: string | null | undefined): string | null {
    const normalizedValues = dedupeValues(
        splitMultiValueFacet(value)
            .map((part) => normalizeCategoryName(part))
            .filter((part): part is string => !!part),
    );

    return normalizedValues.length > 0 ? normalizedValues.join('|') : null;
}

export function normalizeProductTypeToken(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    const normalized = collapseWhitespace(value);
    if (!normalized) {
        return null;
    }

    const correction = PRODUCT_TYPE_CORRECTIONS[normalized.toLowerCase()];
    if (correction) {
        return correction;
    }

    return toTitleCase(normalized);
}

export function normalizeProductTypeValue(value: string | null | undefined): string | null {
    const normalizedValues = dedupeValues(
        splitMultiValueFacet(value)
            .map((part) => normalizeProductTypeToken(part))
            .filter((part): part is string => !!part),
    );

    return normalizedValues.length > 0 ? normalizedValues.join('|') : null;
}

export function normalizeCategoryOptions<T extends { name: string }>(items: T[]): T[] {
    const normalizedItems = new Map<string, T>();

    for (const item of items) {
        const normalizedName = normalizeCategoryName(item.name);
        if (!normalizedName) {
            continue;
        }

        const key = normalizedName.toLowerCase();
        if (normalizedItems.has(key)) {
            continue;
        }

        normalizedItems.set(key, {
            ...item,
            name: normalizedName,
        });
    }

    return Array.from(normalizedItems.values())
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeProductTypeOptions<T extends { name: string }>(items: T[]): T[] {
    const normalizedItems = new Map<string, T>();

    for (const item of items) {
        const normalizedName = normalizeProductTypeToken(item.name);
        if (!normalizedName) {
            continue;
        }

        const key = normalizedName.toLowerCase();
        if (normalizedItems.has(key)) {
            continue;
        }

        normalizedItems.set(key, {
            ...item,
            name: normalizedName,
        });
    }

    return Array.from(normalizedItems.values())
        .sort((left, right) => left.name.localeCompare(right.name));
}
