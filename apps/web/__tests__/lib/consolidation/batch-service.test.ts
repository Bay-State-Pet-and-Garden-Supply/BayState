import { applyConsolidationResults, createBatchContent } from '@/lib/consolidation/batch-service';
import { createAdminClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(),
}));

describe('consolidation batch service', () => {
    it('createBatchContent keeps scalar/array enrichment fields and excludes urls/images', () => {
        const content = createBatchContent(
            [
                {
                    sku: 'SKU-1',
                    sources: {
                        ai_discovery: {
                        Name: 'KONG Air Dog Squeaker Tennis Ball',
                        Brand: 'KONG',
                        confidence: 0.88,
                        search_keywords: 'fetch toy, tennis ball',
                        is_taxable: true,
                        categories: ['Dog Toys', 'Fetch Toys'],
                        source_url: 'https://example.com/product',
                        images: ['https://example.com/image.jpg'],
                    },
                },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';

        expect(userContent).toContain('"confidence": 0.88');
        expect(userContent).toContain('"categories": [');
        expect(userContent).not.toContain('source_url');
        expect(userContent).not.toContain('"images"');
        expect(userContent).not.toContain('search_keywords');
        expect(userContent).not.toContain('is_taxable');
    });

    it('createBatchContent excludes manual-selection fields like special order', () => {
        const content = createBatchContent(
            [
                {
                    sku: 'SKU-MANUAL',
                    sources: {
                        distributor_a: {
                            title: 'Acme Deluxe Bird Seed 10 lb.',
                            brand: 'Acme',
                            is_special_order: true,
                            special_order: 'yes',
                            manual_selection: 'keep for admin review',
                            selected_images: ['https://cdn.example.com/keep-out.jpg'],
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';

        expect(userContent).toContain('"title": "Acme Deluxe Bird Seed 10 lb."');
        expect(userContent).not.toContain('is_special_order');
        expect(userContent).not.toContain('special_order');
        expect(userContent).not.toContain('manual_selection');
        expect(userContent).not.toContain('selected_images');
    });

    it('createBatchContent strips excluded nested keys from relevant object fields', () => {
        const content = createBatchContent(
            [
                {
                    sku: 'SKU-NESTED',
                    sources: {
                        distributor_b: {
                            title: 'Garden Bucket 5 gal.',
                            attributes: {
                                finish: 'Matte',
                                image_url: 'https://cdn.example.com/image.jpg',
                                manual_selection: 'requires admin pick',
                                taxable: true,
                                is_special_order: true,
                                nested: {
                                    Special_Order: 'yes',
                                    search_keywords: 'bucket, garden',
                                    color: 'Green',
                                },
                            },
                        },
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';

        expect(userContent).toContain('"attributes": {');
        expect(userContent).toContain('"finish": "Matte"');
        expect(userContent).toContain('"color": "Green"');
        expect(userContent).not.toContain('image_url');
        expect(userContent).not.toContain('manual_selection');
        expect(userContent).not.toContain('special_order');
        expect(userContent).not.toContain('is_special_order');
        expect(userContent).not.toContain('taxable');
        expect(userContent).not.toContain('search_keywords');
    });

    it('createBatchContent preserves legacy flat payloads as _legacy source and strips image/url keys', () => {
        const content = createBatchContent(
            [
                {
                    sku: 'SKU-LEGACY',
                    sources: {
                        Name: 'Legacy Product Name',
                        Brand: 'Legacy Brand',
                        source_url: 'https://example.com/item',
                        image_url: 'https://example.com/image.jpg',
                    },
                },
            ],
            'system prompt'
        );

        const firstLine = content.split('\n')[0];
        const parsed = JSON.parse(firstLine) as {
            body: {
                messages: Array<{ role: string; content: string }>;
            };
        };
        const userContent = parsed.body.messages.find((message) => message.role === 'user')?.content || '';

        expect(userContent).toContain('"_legacy"');
        expect(userContent).toContain('"title": "Legacy Product Name"');
        expect(userContent).toContain('"brand": "Legacy Brand"');
        expect(userContent).not.toContain('"source_url"');
        expect(userContent).not.toContain('"image_url"');
    });

    it('applyConsolidationResults merges existing consolidated data and resolves brand ids', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { sku: 'SKU-1' },
            error: null,
        });
        const productsIngestionUpdateSelect = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionUpdateMaybeSingle });
        const productsIngestionUpdateEq = jest.fn();
        productsIngestionUpdateEq.mockReturnValue({
            eq: productsIngestionUpdateEq,
            select: productsIngestionUpdateSelect,
        });
        const productsIngestionUpdate = jest
            .fn()
            .mockReturnValue({ eq: productsIngestionUpdateEq });

        const productsIngestionSelectBySkuIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        sku: 'SKU-1',
                        consolidated: {
                            images: ['https://cdn.example.com/existing.jpg'],
                            stock_status: 'in_stock',
                            search_keywords: 'legacy keywords',
                            is_taxable: true,
                        },
                        sources: {
                            chewy: {
                                images: ['https://cdn.example.com/source.jpg'],
                            },
                        },
                        image_candidates: ['https://cdn.example.com/candidate.jpg'],
                        selected_images: [{ url: 'https://cdn.example.com/selected.jpg' }],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {
                    images: ['https://cdn.example.com/existing.jpg'],
                    stock_status: 'in_stock',
                    search_keywords: 'legacy keywords',
                    is_taxable: true,
                },
                updated_at: '2026-03-18T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns === 'sku, consolidated, sources, image_candidates, selected_images') {
                return productsIngestionSelectBySkuIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-1', name: 'KONG' }],
            error: null,
        });

        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: productsIngestionSelect,
                        update: productsIngestionUpdate,
                    };
                }

                if (table === 'brands') {
                    return {
                        select: brandsSelect,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const resultWithLegacyKeywordField = [
            {
                sku: 'SKU-1',
                name: 'KONG Air Dog Squeaker Tennis Ball 3 ct',
                brand: 'KONG',
                description: 'Fetch ball toy for dogs',
                weight: '3',
                category: 'Dog',
                product_type: 'Dog Toys',
                search_keywords: 'fetch toy, tennis ball',
                confidence_score: 0.94,
            },
        ] as unknown;

        const response = await applyConsolidationResults(
            resultWithLegacyKeywordField as Parameters<typeof applyConsolidationResults>[0]
        );

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'finalized',
                pipeline_status_new: 'finalized',
                confidence_score: 0.94,
                error_message: null,
                consolidated: expect.objectContaining({
                    brand_id: 'brand-uuid-1',
                    brand: 'KONG',
                    images: ['https://cdn.example.com/existing.jpg'],
                    stock_status: 'in_stock',
                }),
            })
        );
        expect(productsIngestionUpdateEq).toHaveBeenCalledWith('sku', 'SKU-1');
        expect(productsIngestionUpdateEq).toHaveBeenCalledWith('updated_at', '2026-03-18T00:00:00.000Z');

        const updatePayload = (productsIngestionUpdate as jest.Mock).mock.calls[0]?.[0] as {
            consolidated?: Record<string, unknown>;
        };
        expect(updatePayload.consolidated).not.toHaveProperty('search_keywords');
        expect(updatePayload.consolidated).not.toHaveProperty('is_taxable');
        expect(updatePayload.consolidated).not.toHaveProperty('taxable');
    });

    it('applyConsolidationResults creates a missing brand and writes the new brand id', async () => {
        const productsIngestionUpdateMaybeSingle = jest.fn().mockResolvedValue({
            data: { sku: 'SKU-NEW' },
            error: null,
        });
        const productsIngestionUpdateSelect = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionUpdateMaybeSingle });
        const productsIngestionUpdateEq = jest.fn();
        productsIngestionUpdateEq.mockReturnValue({
            eq: productsIngestionUpdateEq,
            select: productsIngestionUpdateSelect,
        });
        const productsIngestionUpdate = jest
            .fn()
            .mockReturnValue({ eq: productsIngestionUpdateEq });

        const productsIngestionSelectBySkuIn = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        sku: 'SKU-NEW',
                        consolidated: {},
                        sources: {},
                        image_candidates: [],
                        selected_images: [],
                    },
                ],
                error: null,
            }),
        };

        const productsIngestionSelectCurrentMaybeSingle = jest.fn().mockResolvedValue({
            data: {
                consolidated: {},
                updated_at: '2026-03-19T00:00:00.000Z',
            },
            error: null,
        });
        const productsIngestionSelectCurrentEq = jest
            .fn()
            .mockReturnValue({ maybeSingle: productsIngestionSelectCurrentMaybeSingle });
        const productsIngestionSelect = jest.fn((columns: string) => {
            if (columns === 'sku, consolidated, sources, image_candidates, selected_images') {
                return productsIngestionSelectBySkuIn;
            }
            if (columns === 'consolidated, updated_at') {
                return {
                    eq: productsIngestionSelectCurrentEq,
                };
            }
            throw new Error(`Unexpected products_ingestion select columns: ${columns}`);
        });

        const brandsInsertSingle = jest.fn().mockResolvedValue({
            data: { id: 'brand-uuid-new' },
            error: null,
        });
        const brandsInsertSelect = jest.fn().mockReturnValue({ single: brandsInsertSingle });
        const brandsInsert = jest.fn().mockReturnValue({ select: brandsInsertSelect });
        const brandsSelect = jest.fn().mockResolvedValue({
            data: [],
            error: null,
        });

        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: productsIngestionSelect,
                        update: productsIngestionUpdate,
                    };
                }

                if (table === 'brands') {
                    return {
                        select: brandsSelect,
                        insert: brandsInsert,
                    };
                }

                throw new Error(`Unexpected table: ${table}`);
            }),
        };

        (createAdminClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                sku: 'SKU-NEW',
                name: 'Fresh Batch Chicken Recipe 12 lb.',
                brand: 'Fresh Batch',
                description: 'Premium dog food',
                weight: '12',
                category: 'Dog',
                product_type: 'Dog Food',
                confidence_score: 0.92,
            },
        ]);

        expect(brandsInsert).toHaveBeenCalledWith({
            name: 'Fresh Batch',
            slug: 'fresh-batch',
        });
        expect(productsIngestionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'finalized',
                pipeline_status_new: 'finalized',
                confidence_score: 0.92,
                error_message: null,
                consolidated: expect.objectContaining({
                    brand: 'Fresh Batch',
                    brand_id: 'brand-uuid-new',
                }),
            })
        );
        expect('status' in response && response.status === 'applied').toBe(true);
        if ('status' in response) {
            expect(response.quality_metrics).toEqual(
                expect.objectContaining({
                    matched_brand_count: 1,
                    unresolved_brand_count: 0,
                })
            );
        }
    });
});
