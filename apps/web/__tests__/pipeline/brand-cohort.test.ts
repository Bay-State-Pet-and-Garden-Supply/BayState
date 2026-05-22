/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assignProductsToCohorts } from '@/lib/admin/cohort-utils';
import { recohortProducts } from '@/lib/pipeline/cohorts';

describe('Brand-aware Cohort Auto-Assignment', () => {
    let mockSupabase: any;
    let productsIngestionDb: any[];
    let cohortBatchesDb: any[];
    let cohortMembersDb: any[];
    let brandsDb: any[];

    beforeEach(() => {
        productsIngestionDb = [
            { upc: '1234560001', brand_id: 'brand-a', cohort_id: null, consolidated: {} },
            { upc: '1234560002', brand_id: 'brand-b', cohort_id: null, consolidated: {} },
            { upc: '1234560003', brand_id: 'brand-a', cohort_id: null, consolidated: {} },
            { upc: '7890120001', brand_id: null, cohort_id: null, consolidated: {} },
        ];
        cohortBatchesDb = [];
        cohortMembersDb = [];
        brandsDb = [
            { id: 'brand-a', name: 'Brand Alpha' },
            { id: 'brand-b', name: 'Brand Beta' },
        ];

        mockSupabase = {
            from: jest.fn().mockImplementation((table: string) => {
                return {
                    select: jest.fn().mockImplementation((fields: string) => {
                        return {
                            in: jest.fn().mockImplementation(async (column: string, values: any[]) => {
                                if (table === 'products_ingestion' && column === 'upc') {
                                    const data = productsIngestionDb.filter(p => values.includes(p.upc));
                                    return { data, error: null };
                                }
                                if (table === 'brands' && column === 'id') {
                                    const data = brandsDb.filter(b => values.includes(b.id));
                                    return { data, error: null };
                                }
                                if (table === 'cohort_batches' && column === 'upc_prefix') {
                                    const data = cohortBatchesDb.filter(c => values.includes(c.upc_prefix));
                                    return { data, error: null };
                                }
                                return { data: [], error: null };
                            }),
                        };
                    }),
                    insert: jest.fn().mockImplementation((payload: any) => {
                        const rows = Array.isArray(payload) ? payload : [payload];
                        const inserted = rows.map((r, i) => {
                            const newRow = {
                                id: `cohort-uuid-${cohortBatchesDb.length + i + 1}`,
                                ...r,
                            };
                            cohortBatchesDb.push(newRow);
                            return newRow;
                        });
                        return {
                            select: jest.fn().mockImplementation(() => ({
                                single: async () => ({ data: inserted[0], error: null }),
                                maybeSingle: async () => ({ data: inserted[0], error: null }),
                                data: inserted,
                                error: null,
                            })),
                            data: inserted,
                            error: null,
                        };
                    }),
                    update: jest.fn().mockImplementation((payload: any) => {
                        return {
                            in: jest.fn().mockImplementation(async (column: string, values: any[]) => {
                                if (table === 'products_ingestion' && column === 'upc') {
                                    productsIngestionDb.forEach(p => {
                                        if (values.includes(p.upc)) {
                                            Object.assign(p, payload);
                                        }
                                    });
                                }
                                return { error: null };
                            }),
                            eq: jest.fn().mockImplementation(async (column: string, value: any) => {
                                if (table === 'products_ingestion' && column === 'upc') {
                                    const product = productsIngestionDb.find(p => p.upc === value);
                                    if (product) {
                                        Object.assign(product, payload);
                                    }
                                }
                                return { error: null };
                            }),
                        };
                    }),
                    upsert: jest.fn().mockImplementation(async (payload: any) => {
                        const rows = Array.isArray(payload) ? payload : [payload];
                        rows.forEach(r => {
                            const existingIdx = cohortMembersDb.findIndex(
                                m => m.cohort_id === r.cohort_id && m.product_upc === r.product_upc
                            );
                            if (existingIdx >= 0) {
                                cohortMembersDb[existingIdx] = r;
                            } else {
                                cohortMembersDb.push(r);
                            }
                        });
                        return { error: null };
                    }),
                };
            }),
        } as unknown as SupabaseClient;
    });

    it('should assign products with different brands to separate cohorts despite sharing prefix', async () => {
        const upcs = ['1234560001', '1234560002', '1234560003'];
        const result = await assignProductsToCohorts(mockSupabase, upcs);

        expect(result.assigned).toBe(3);
        expect(result.cohortCount).toBe(2);

        // Verify cohort_batches created
        expect(cohortBatchesDb.length).toBe(2);
        const cohortA = cohortBatchesDb.find(c => c.brand_id === 'brand-a');
        const cohortB = cohortBatchesDb.find(c => c.brand_id === 'brand-b');
        expect(cohortA).toBeDefined();
        expect(cohortB).toBeDefined();
        expect(cohortA.brand_name).toBe('Brand Alpha');
        expect(cohortB.brand_name).toBe('Brand Beta');

        // Verify products assigned
        const p1 = productsIngestionDb.find(p => p.upc === '1234560001');
        const p2 = productsIngestionDb.find(p => p.upc === '1234560002');
        expect(p1.cohort_id).toBe(cohortA.id);
        expect(p2.cohort_id).toBe(cohortB.id);

        // Verify members table entries
        expect(cohortMembersDb.length).toBe(3);
        expect(cohortMembersDb.some(m => m.product_upc === '1234560001' && m.cohort_id === cohortA.id)).toBe(true);
        expect(cohortMembersDb.some(m => m.product_upc === '1234560002' && m.cohort_id === cohortB.id)).toBe(true);
    });

    it('should re-cohort products correctly and transition status to imported when brand changes', async () => {
        // Initial state: product is in a cohort with no brand
        cohortBatchesDb.push({
            id: 'cohort-nobrand',
            upc_prefix: '123456',
            brand_id: null,
            name: '123456',
        });
        productsIngestionDb[0].cohort_id = 'cohort-nobrand';
        productsIngestionDb[0].brand_id = null;
        productsIngestionDb[0].pipeline_status = 'awaiting_brand';

        // Mock the find/eq query inside recohortProducts
        mockSupabase.from.mockImplementation((table: string) => {
            const queryBuilder: any = {
                select: jest.fn().mockReturnThis(),
                in: jest.fn().mockImplementation(async (col: string, vals: any[]) => {
                    if (table === 'products_ingestion') {
                        const data = productsIngestionDb.filter(p => vals.includes(p.upc));
                        return { data, error: null };
                    }
                    return { data: [], error: null };
                }),
                eq: jest.fn().mockImplementation(function (this: any, col: string, val: any) {
                    return this;
                }),
                is: jest.fn().mockImplementation(function (this: any, col: string, val: any) {
                    return this;
                }),
                maybeSingle: async function () {
                    if (table === 'cohort_batches') {
                        // find matching cohort
                        const cohort = cohortBatchesDb.find(c => c.brand_id === 'brand-a');
                        return { data: cohort || null, error: null };
                    }
                    return { data: null, error: null };
                },
                insert: jest.fn().mockImplementation((payload: any) => {
                    const rows = Array.isArray(payload) ? payload : [payload];
                    const inserted = rows.map((r, i) => {
                        const newRow = {
                            id: `cohort-uuid-new`,
                            ...r,
                        };
                        cohortBatchesDb.push(newRow);
                        return newRow;
                    });
                    
                    return {
                        select: jest.fn().mockReturnThis(),
                        single: async () => ({ data: inserted[0], error: null }),
                        maybeSingle: async () => ({ data: inserted[0], error: null }),
                        data: inserted,
                        error: null,
                    };
                }),
                update: jest.fn().mockImplementation((payload: any) => {
                    return {
                        eq: jest.fn().mockImplementation(async (col: string, val: any) => {
                            if (table === 'products_ingestion' && col === 'upc') {
                                const product = productsIngestionDb.find(p => p.upc === val);
                                if (product) {
                                    Object.assign(product, payload);
                                }
                            }
                            return { error: null };
                        }),
                    };
                }),
                upsert: jest.fn().mockImplementation(async (payload: any) => {
                    const rows = Array.isArray(payload) ? payload : [payload];
                    rows.forEach(r => {
                        const existingIdx = cohortMembersDb.findIndex(
                            m => m.cohort_id === r.cohort_id && m.product_upc === r.product_upc
                        );
                        if (existingIdx >= 0) {
                            cohortMembersDb[existingIdx] = r;
                        } else {
                            cohortMembersDb.push(r);
                        }
                    });
                    return { error: null };
                }),
                delete: jest.fn().mockImplementation(function (this: any) {
                    return this;
                }),
            };
            return queryBuilder;
        });

        // Trigger recohortProducts
        await recohortProducts(mockSupabase, ['1234560001'], 'brand-a');

        // Target cohort should be created
        const targetCohort = cohortBatchesDb.find(c => c.brand_id === 'brand-a');
        expect(targetCohort).toBeDefined();

        // Product should have moved to the new cohort and status updated to imported
        const product = productsIngestionDb.find(p => p.upc === '1234560001');
        expect(product.cohort_id).toBe(targetCohort.id);
        expect(product.brand_id).toBe('brand-a');
        expect(product.pipeline_status).toBe('imported');
    });
});
