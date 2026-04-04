/**
 * @jest-environment node
 */
/* eslint-disable unicorn/no-thenable */

import type { SupabaseClient } from '@supabase/supabase-js';

import { completeMigrationLog, updateMigrationProgress } from '@/lib/admin/migration/history';
import { importShopSiteProducts } from '@/lib/admin/migration/product-import';
import type { ShopSiteProduct, SyncResult } from '@/lib/admin/migration/types';
import { GENERIC_FACET_FIELDS, getGenericFacetDefinition } from '@/lib/facets/generic-normalization';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

type TableName =
    | 'products'
    | 'related_products'
    | 'brands'
    | 'categories'
    | 'pet_types'
    | 'product_categories'
    | 'product_pet_types'
    | 'facet_definitions'
    | 'facet_values'
    | 'product_facets'
    | 'products_ingestion';

type Row = Record<string, unknown>;
type DatabaseState = Record<TableName, Row[]>;

function createMockQueryBuilder(
    table: TableName,
    state: DatabaseState,
    counters: Record<string, number>,
) {
    let operation: 'select' | 'insert' | 'upsert' | 'delete' | null = null;
    let payload: Row | Row[] | null = null;
    let onConflict: string | undefined;
    const filters: Array<{ type: 'eq' | 'in'; field: string; value: unknown }> = [];
    let rangeStart: number | null = null;
    let rangeEnd: number | null = null;
    let singleRow = false;

    const nextId = (scope: string) => {
        counters[scope] = (counters[scope] ?? 0) + 1;
        return counters[scope];
    };

    const toRows = (value: Row | Row[] | null): Row[] => {
        if (!value) {
            return [];
        }

        return Array.isArray(value) ? value : [value];
    };

    const applyFilters = (rows: Row[]) => rows.filter((row) => filters.every((filter) => {
        if (filter.type === 'eq') {
            return row[filter.field] === filter.value;
        }

        return Array.isArray(filter.value) && filter.value.includes(row[filter.field]);
    }));

    const insertRow = (row: Row): Row => {
        const insertedRow = { ...row };

        if (!insertedRow.id) {
            insertedRow.id = `${table}-${nextId(table)}`;
        }

        state[table].push(insertedRow);
        return insertedRow;
    };

    const execute = async () => {
        if (operation === 'insert') {
            const insertedRows = toRows(payload).map((row) => insertRow(row));
            return { data: singleRow ? insertedRows[0] ?? null : insertedRows, error: null };
        }

        if (operation === 'upsert') {
            const conflictFields = onConflict?.split(',').map((field) => field.trim()).filter(Boolean) ?? [];
            const upsertedRows = toRows(payload).map((row) => {
                const existingRow = conflictFields.length > 0
                    ? state[table].find((candidate) => conflictFields.every((field) => candidate[field] === row[field]))
                    : undefined;

                if (existingRow) {
                    Object.assign(existingRow, row);
                    return existingRow;
                }

                return insertRow(row);
            });

            return { data: singleRow ? upsertedRows[0] ?? null : upsertedRows, error: null };
        }

        if (operation === 'delete') {
            const rowsToDelete = applyFilters(state[table]);
            state[table] = state[table].filter((row) => !rowsToDelete.includes(row));
            return { data: null, error: null };
        }

        let rows = applyFilters(state[table]);
        if (rangeStart !== null && rangeEnd !== null) {
            rows = rows.slice(rangeStart, rangeEnd + 1);
        }

        return { data: singleRow ? rows[0] ?? null : rows, error: null };
    };

    const builder = Promise.resolve(null).then(() => execute()) as Promise<Awaited<ReturnType<typeof execute>>> & {
        select: (_columns?: string) => typeof builder;
        insert: (value: Row | Row[]) => typeof builder;
        upsert: (value: Row | Row[], options?: { onConflict?: string }) => typeof builder;
        delete: () => typeof builder;
        eq: (field: string, value: unknown) => typeof builder;
        in: (field: string, value: unknown[]) => typeof builder;
        range: (start: number, end: number) => typeof builder;
        single: () => Promise<Awaited<ReturnType<typeof execute>>>;
    };

    builder.select = (_columns?: string) => {
        if (!operation) {
            operation = 'select';
        }

        return builder;
    };

    builder.insert = (value: Row | Row[]) => {
        operation = 'insert';
        payload = value;
        return builder;
    };

    builder.upsert = (value: Row | Row[], options?: { onConflict?: string }) => {
        operation = 'upsert';
        payload = value;
        onConflict = options?.onConflict;
        return builder;
    };

    builder.delete = () => {
        operation = 'delete';
        return builder;
    };

    builder.eq = (field: string, value: unknown) => {
        filters.push({ type: 'eq', field, value });
        return builder;
    };

    builder.in = (field: string, value: unknown[]) => {
        filters.push({ type: 'in', field, value });
        return builder;
    };

    builder.range = (start: number, end: number) => {
        rangeStart = start;
        rangeEnd = end;
        return builder;
    };

    builder.single = async () => {
        singleRow = true;
        return execute();
    };

    return builder;
}

function createMockSupabase(partialState: Partial<DatabaseState> = {}) {
    const facetDefinitions = Object.keys(GENERIC_FACET_FIELDS).map((field, index) => {
        const definition = getGenericFacetDefinition(field as keyof typeof GENERIC_FACET_FIELDS);

        return {
            id: `facet-definition-${index + 1}`,
            name: definition.name,
            slug: definition.slug,
            description: definition.description,
        };
    });

    const state: DatabaseState = {
        products: [],
        related_products: [],
        brands: [],
        categories: [],
        pet_types: [],
        product_categories: [],
        product_pet_types: [],
        facet_definitions: facetDefinitions,
        facet_values: [],
        product_facets: [],
        products_ingestion: [],
        ...partialState,
    };

    const counters: Record<string, number> = {};
    const supabase = {
        from(table: TableName) {
            return createMockQueryBuilder(table, state, counters);
        },
    };

    return {
        supabase: supabase as unknown as SupabaseClient,
        state,
    };
}

function buildShopSiteProduct(overrides: Partial<ShopSiteProduct> = {}): ShopSiteProduct {
    return {
        sku: overrides.sku ?? 'SKU-1',
        name: overrides.name ?? 'Example Product',
        price: overrides.price ?? 9.99,
        description: overrides.description ?? '',
        quantityOnHand: overrides.quantityOnHand ?? 5,
        imageUrl: overrides.imageUrl ?? '',
        brandName: overrides.brandName ?? '',
        categoryName: overrides.categoryName ?? '',
        productTypeName: overrides.productTypeName ?? '',
        petTypeName: overrides.petTypeName ?? '',
        shortName: overrides.shortName ?? '',
        isSpecialOrder: overrides.isSpecialOrder ?? false,
        inStorePickup: overrides.inStorePickup ?? false,
        lifeStage: overrides.lifeStage ?? '',
        petSize: overrides.petSize ?? '',
        specialDiet: overrides.specialDiet ?? '',
        healthFeature: overrides.healthFeature ?? '',
        foodForm: overrides.foodForm ?? '',
        flavor: overrides.flavor ?? '',
        productFeature: overrides.productFeature ?? '',
        size: overrides.size ?? '',
        color: overrides.color ?? '',
        packagingType: overrides.packagingType ?? '',
        crossSellSkus: overrides.crossSellSkus ?? [],
        ...overrides,
    };
}

describe('importShopSiteProducts cross-sell linking', () => {
    it('creates one-way PF32 relations after upserts and records skipped counters', async () => {
        const { supabase, state } = createMockSupabase({
            pet_types: [{ id: 'pet-type-dog', name: 'Dog' }],
        });
        const updateProgress = jest.fn().mockResolvedValue(undefined);

        const result = await importShopSiteProducts({
            supabase,
            logId: 'migration-log-1',
            updateProgress,
            shopSiteProducts: [
                buildShopSiteProduct({
                    sku: 'XSELL-SOURCE-001',
                    name: 'Cross Sell Source',
                    petTypeName: 'Dog',
                    crossSellSkus: [' XSELL-TARGET-001|XSELL-TARGET-001|XSELL-SOURCE-001|MISSING-SKU|| '],
                }),
                buildShopSiteProduct({
                    sku: 'XSELL-TARGET-001',
                    name: 'Cross Sell Target',
                    petTypeName: 'Dog',
                }),
            ],
        });

        expect(result).toMatchObject({
            success: true,
            created: 2,
            failed: 0,
            skipped: 3,
            audit: {
                crossSell: {
                    sourcesProcessed: 2,
                    linked: 1,
                    skipped: 3,
                    skippedDuplicates: 1,
                    skippedSelfLinks: 1,
                    skippedMissing: 1,
                },
            },
        });

        expect(state.related_products).toEqual([
            expect.objectContaining({
                product_id: 'products-1',
                related_product_id: 'products-2',
                relation_type: 'cross_sell',
                position: 0,
            }),
        ]);
        expect(state.related_products).toHaveLength(1);
        expect(updateProgress).not.toHaveBeenCalled();
    });

    it('clears stale cross-sell rows when a rerun has no PF32 values', async () => {
        const { supabase, state } = createMockSupabase({
            pet_types: [{ id: 'pet-type-dog', name: 'Dog' }],
            products: [
                { id: 'existing-source', sku: 'XSELL-SOURCE-001', slug: 'cross-sell-source' },
                { id: 'existing-target', sku: 'XSELL-TARGET-001', slug: 'cross-sell-target' },
            ],
            related_products: [
                {
                    id: 'related-1',
                    product_id: 'existing-source',
                    related_product_id: 'existing-target',
                    relation_type: 'cross_sell',
                    position: 0,
                },
            ],
        });

        const result = await importShopSiteProducts({
            supabase,
            shopSiteProducts: [
                buildShopSiteProduct({
                    sku: 'XSELL-SOURCE-001',
                    name: 'Cross Sell Source',
                    petTypeName: 'Dog',
                    crossSellSkus: [],
                }),
            ],
        });

        expect(result).toMatchObject({ success: true, updated: 1, skipped: 0 });
        expect(state.related_products).toEqual([]);
    });
});

describe('migration history audit summaries', () => {
    let mockSupabase: {
        from: jest.Mock;
        update: jest.Mock;
        eq: jest.Mock;
    };

    beforeEach(() => {
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('adds processed, skipped, and cross-sell bookkeeping to persisted migration logs', async () => {
        const result = {
            success: true,
            processed: 5,
            created: 3,
            updated: 2,
            failed: 0,
            errors: [],
            duration: 250,
            skipped: 3,
            audit: {
                crossSell: {
                    sourcesProcessed: 2,
                    linked: 1,
                    skipped: 3,
                    skippedDuplicates: 1,
                    skippedSelfLinks: 1,
                    skippedMissing: 1,
                },
            },
        } satisfies SyncResult & {
            skipped: number;
            audit: {
                crossSell: {
                    sourcesProcessed: number;
                    linked: number;
                    skipped: number;
                    skippedDuplicates: number;
                    skippedSelfLinks: number;
                    skippedMissing: number;
                };
            };
        };

        await updateMigrationProgress('log-1', result);
        await completeMigrationLog('log-1', result);

        expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
            processed: 5,
            failed: 0,
            errors: expect.arrayContaining([
                expect.objectContaining({
                    record: '__audit__',
                    error: 'Audit summary: processed=5, skipped=3, failed=0',
                }),
                expect.objectContaining({
                    record: '__audit_cross_sell__',
                    error: 'Cross-sell summary: sources=2, linked=1, skipped=3, duplicate=1, self=1, missing=1',
                }),
            ]),
        }));
    });
});
