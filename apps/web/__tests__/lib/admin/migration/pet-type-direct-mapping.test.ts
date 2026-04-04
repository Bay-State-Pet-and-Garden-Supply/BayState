/**
 * @jest-environment node
 */
/* eslint-disable unicorn/no-thenable */

import type { SupabaseClient } from '@supabase/supabase-js';

import { importShopSiteProducts } from '@/lib/admin/migration/product-import';
import type { ShopSiteProduct } from '@/lib/admin/migration/types';
import { GENERIC_FACET_FIELDS, getGenericFacetDefinition } from '@/lib/facets/generic-normalization';

type TableName =
    | 'products'
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
        ...overrides,
    };
}

describe('importShopSiteProducts pet-type canonical mapping', () => {
    it('creates direct PF17 joins without falling back to inference when the canonical pet type is recognized', async () => {
        const { supabase, state } = createMockSupabase({
            pet_types: [
                { id: 'pet-type-dog', name: 'Dog' },
                { id: 'pet-type-cat', name: 'Cat' },
            ],
        });

        const result = await importShopSiteProducts({
            supabase,
            shopSiteProducts: [buildShopSiteProduct({
                sku: 'DIRECT-001',
                name: 'Cat Crunchy Snacks',
                petTypeName: 'Dog',
            })],
        });

        expect(result).toMatchObject({ success: true, created: 1, failed: 0 });
        expect(state.product_pet_types).toEqual([
            expect.objectContaining({
                product_id: 'products-1',
                pet_type_id: 'pet-type-dog',
            }),
        ]);
    });

    it('falls back to inferred pet types only when PF17 is blank or unrecognized', async () => {
        const { supabase, state } = createMockSupabase({
            pet_types: [
                { id: 'pet-type-dog', name: 'Dog' },
                { id: 'pet-type-cat', name: 'Cat' },
            ],
        });

        const result = await importShopSiteProducts({
            supabase,
            shopSiteProducts: [buildShopSiteProduct({
                sku: 'FALLBACK-001',
                name: 'Cat Crunchy Snacks',
                petTypeName: '',
            })],
        });

        expect(result).toMatchObject({ success: true, created: 1, failed: 0 });
        expect(state.product_pet_types).toEqual([
            expect.objectContaining({
                product_id: 'products-1',
                pet_type_id: 'pet-type-cat',
            }),
        ]);
    });

    it('clears prior normalized links and operational fields when corrected canonical values are blank on rerun', async () => {
        const { supabase, state } = createMockSupabase({
            products: [
                {
                    id: 'existing-product-1',
                    sku: 'CLEAR-001',
                    slug: 'existing-product',
                    brand_id: 'brand-1',
                    short_name: 'Legacy Short Name',
                    is_special_order: true,
                    in_store_pickup: true,
                    category: 'Dog Food',
                },
            ],
            pet_types: [{ id: 'pet-type-dog', name: 'Dog' }],
            product_categories: [{ product_id: 'existing-product-1', category_id: 'category-1' }],
            product_pet_types: [{ product_id: 'existing-product-1', pet_type_id: 'pet-type-dog' }],
            facet_values: [
                {
                    id: 'facet-value-1',
                    facet_definition_id: 'facet-definition-1',
                    value: 'Adult',
                    normalized_value: 'Adult',
                    slug: 'adult',
                },
            ],
            product_facets: [{ product_id: 'existing-product-1', facet_value_id: 'facet-value-1' }],
        });

        const result = await importShopSiteProducts({
            supabase,
            shopSiteProducts: [buildShopSiteProduct({
                sku: 'CLEAR-001',
                name: 'Garden Hose',
                shortName: '',
                brandName: '',
                categoryName: '',
                productTypeName: '',
                petTypeName: '',
                isSpecialOrder: false,
                inStorePickup: false,
                lifeStage: '',
            })],
        });

        expect(result).toMatchObject({ success: true, updated: 1, failed: 0 });
        expect(state.products).toEqual([
            expect.objectContaining({
                id: 'existing-product-1',
                sku: 'CLEAR-001',
                slug: 'existing-product',
                brand_id: null,
                short_name: null,
                is_special_order: false,
                in_store_pickup: false,
                category: null,
                product_type: null,
            }),
        ]);
        expect(state.product_categories).toEqual([]);
        expect(state.product_pet_types).toEqual([]);
        expect(state.product_facets).toEqual([]);
    });
});
