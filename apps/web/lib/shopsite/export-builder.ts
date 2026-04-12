import { buildProductSlug } from '@/lib/admin/migration/product-sync';
import { buildFacetSlug, normalizeBrandName } from '@/lib/facets/normalization';
import { createAdminClient } from '@/lib/supabase/server';
import type { ShopSiteExportProduct } from './xml-generator';

const PAGE_SIZE = 200;

export interface ShopSiteExportSourceRow {
    sku: string;
    input: unknown;
    consolidated: unknown;
    selected_images: unknown;
}

export interface ShopSiteExportBrandRow {
    id: string;
    name: string;
    slug: string | null;
}

type JsonRecord = Record<string, unknown>;

export interface PreparedShopSiteExportProduct extends ShopSiteExportProduct {
    brand_folder: string;
    image_sources: string[];
}

export interface PreparedShopSiteExport {
    products: PreparedShopSiteExportProduct[];
}

function asRecord(value: unknown): JsonRecord {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as JsonRecord;
    }

    return {};
}

function asString(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return '';
}

function coalesceString(...values: unknown[]): string | null {
    for (const value of values) {
        const normalized = asString(value);
        if (normalized.length > 0) {
            return normalized;
        }
    }

    return null;
}

function coalescePrice(...values: unknown[]): number | string {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim().length > 0) {
            const numeric = Number.parseFloat(value);
            return Number.isFinite(numeric) ? numeric : value.trim();
        }
    }

    return 0;
}

function coalesceInteger(...values: unknown[]): number | null {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.trunc(value));
        }

        if (typeof value === 'string' && value.trim().length > 0) {
            const numeric = Number.parseInt(value, 10);
            if (Number.isFinite(numeric)) {
                return Math.max(0, numeric);
            }
        }
    }

    return null;
}

function coalesceBoolean(...values: unknown[]): boolean | null {
    for (const value of values) {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'yes', 'checked', 'check'].includes(normalized)) {
                return true;
            }

            if (['false', '0', 'no', 'uncheck', 'unchecked'].includes(normalized)) {
                return false;
            }
        }
    }

    return null;
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)));
}

function extractSelectedImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return uniqueStrings(
        value
            .map((entry) => {
                if (typeof entry === 'string') {
                    return entry;
                }

                if (entry && typeof entry === 'object' && 'url' in entry) {
                    return asString((entry as { url?: unknown }).url);
                }

                return '';
            }),
    );
}

function toImageUrlArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return uniqueStrings(value.map((entry) => asString(entry)));
}

function parsePages(value: unknown): string[] {
    if (Array.isArray(value)) {
        return uniqueStrings(value.map((entry) => asString(entry)));
    }

    if (typeof value === 'string') {
        return uniqueStrings(value.split('|'));
    }

    return [];
}

function normalizeFileStem(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const stem = value.replace(/\.html?$/i, '');
    const normalized = buildProductSlug(stem);
    return normalized.length > 0 ? normalized : null;
}

function getNameForSorting(row: ShopSiteExportSourceRow): string {
    const consolidated = asRecord(row.consolidated);
    const input = asRecord(row.input);
    return coalesceString(consolidated.name, input.name, row.sku) ?? row.sku;
}

function buildUniqueStem(base: string, usedStems: Set<string>, sku: string): string {
    if (!usedStems.has(base)) {
        usedStems.add(base);
        return base;
    }

    const skuStem = buildFacetSlug(sku) || 'sku';
    const skuCandidate = `${base}-${skuStem}`;
    if (!usedStems.has(skuCandidate)) {
        usedStems.add(skuCandidate);
        return skuCandidate;
    }

    let counter = 2;
    while (usedStems.has(`${skuCandidate}-${counter}`)) {
        counter += 1;
    }

    const finalCandidate = `${skuCandidate}-${counter}`;
    usedStems.add(finalCandidate);
    return finalCandidate;
}

export function prepareStorefrontShopSiteExport(
    rows: ShopSiteExportSourceRow[],
    brandsById: Map<string, ShopSiteExportBrandRow> = new Map(),
): PreparedShopSiteExportProduct[] {
    const sortedRows = [...rows].sort((left, right) => {
        const nameComparison = getNameForSorting(left).localeCompare(getNameForSorting(right));
        if (nameComparison !== 0) {
            return nameComparison;
        }

        return left.sku.localeCompare(right.sku);
    });

    const usedFileStems = new Set<string>();
    const usedImageStemsByFolder = new Map<string, Set<string>>();

    return sortedRows.map((row) => {
        const input = asRecord(row.input);
        const consolidated = asRecord(row.consolidated);
        const name = coalesceString(consolidated.name, input.name, row.sku) ?? row.sku;
        const brandId = coalesceString(consolidated.brand_id);
        const brandRow = brandId ? brandsById.get(brandId) : undefined;
        const brandName = normalizeBrandName(
            coalesceString(brandRow?.name, consolidated.brand_name, consolidated.brand, input.brand_name, input.brand),
        );
        const brandFolder = buildFacetSlug(brandRow?.slug ?? brandName ?? 'unbranded') || 'unbranded';
        const preferredFileStem = normalizeFileStem(
            coalesceString(
                consolidated.legacy_filename,
                consolidated.file_name,
                consolidated.fileName,
                input.legacy_filename,
                input.file_name,
                input.fileName,
            ),
        );
        const generatedStem = buildProductSlug(name) || buildFacetSlug(row.sku) || 'product';
        const baseStem = preferredFileStem ?? generatedStem;
        const fileStem = buildUniqueStem(baseStem, usedFileStems, row.sku);

        const usedImageStems = usedImageStemsByFolder.get(brandFolder) ?? new Set<string>();
        usedImageStemsByFolder.set(brandFolder, usedImageStems);
        const imageStem = buildUniqueStem(baseStem, usedImageStems, row.sku);

        const consolidatedImages = toImageUrlArray(consolidated.images);
        const selectedImages = extractSelectedImageUrls(row.selected_images);
        const imageSources = consolidatedImages.length > 0 ? consolidatedImages : selectedImages;
        const images = imageSources.map((_, index) =>
            `${brandFolder}/${imageStem}${index === 0 ? '' : `-${index + 1}`}.jpg`,
        );

        const gtin = coalesceString(consolidated.gtin, input.gtin) ?? (/^\d{8,}$/.test(row.sku) ? row.sku : null);

        return {
            sku: row.sku,
            name,
            price: coalescePrice(consolidated.price, input.price),
            weight: coalesceString(consolidated.weight, input.weight),
            brand_name: brandName,
            description: coalesceString(consolidated.description, input.description),
            long_description: coalesceString(consolidated.long_description, input.long_description),
            images,
            image_sources: imageSources,
            brand_folder: brandFolder,
            category: coalesceString(consolidated.category, input.category),

            shopsite_pages: parsePages(consolidated.product_on_pages ?? input.product_on_pages),
            search_keywords: coalesceString(consolidated.search_keywords, input.search_keywords),
            is_special_order: coalesceBoolean(consolidated.is_special_order, input.is_special_order) ?? false,
            is_taxable: coalesceBoolean(consolidated.is_taxable, input.is_taxable) ?? true,
            file_name: `${fileStem}.html`,
            gtin,
            availability: coalesceString(consolidated.availability, input.availability) ?? 'in stock',
            minimum_quantity: coalesceInteger(consolidated.minimum_quantity, input.minimum_quantity) ?? 0,
        };
    });
}

export async function loadStorefrontShopSiteExport(
    options: { skus?: string[] } = {},
): Promise<PreparedShopSiteExport> {
    const supabase = await createAdminClient();
    const requestedSkus = uniqueStrings(options.skus ?? []);
    const rows: ShopSiteExportSourceRow[] = [];
    let page = 0;

    while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let exportQueueQuery = supabase
            .from('products_ingestion')
            .select('sku, input, consolidated, selected_images')
            .eq('pipeline_status', 'exporting')
            .is('exported_at', null)
            .order('sku', { ascending: true });

        if (requestedSkus.length > 0) {
            exportQueueQuery = exportQueueQuery.in('sku', requestedSkus);
        }

        const { data, error } = await exportQueueQuery.range(from, to);
        if (error) {
            throw new Error(`Failed to load export queue products: ${error.message}`);
        }

        const batch = (data ?? []) as ShopSiteExportSourceRow[];
        if (batch.length === 0) {
            break;
        }

        rows.push(...batch);

        if (batch.length < PAGE_SIZE) {
            break;
        }

        page += 1;
    }

    if (requestedSkus.length > 0) {
        const foundSkus = new Set(rows.map((row) => row.sku));
        const missingSkus = requestedSkus.filter((sku) => !foundSkus.has(sku));
        if (missingSkus.length > 0) {
            throw new Error(`Some requested products are not in the export queue: ${missingSkus.join(', ')}`);
        }
    }

    const brandIds = uniqueStrings(
        rows
            .map((row) => coalesceString(asRecord(row.consolidated).brand_id) ?? '')
            .filter(Boolean),
    );

    const brandsById = new Map<string, ShopSiteExportBrandRow>();
    if (brandIds.length > 0) {
        const { data, error } = await supabase
            .from('brands')
            .select('id, name, slug')
            .in('id', brandIds);

        if (error) {
            throw new Error(`Failed to load brand metadata: ${error.message}`);
        }

        for (const brand of (data ?? []) as ShopSiteExportBrandRow[]) {
            brandsById.set(brand.id, brand);
        }
    }

    return {
        products: prepareStorefrontShopSiteExport(rows, brandsById),
    };
}

export const preparePublishedShopSiteExport = prepareStorefrontShopSiteExport;
export const loadPublishedShopSiteExport = loadStorefrontShopSiteExport;
