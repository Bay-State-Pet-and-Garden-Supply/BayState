import { applyConsolidationResults, createBatchContent } from '@/lib/consolidation/batch-service';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
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
        expect(userContent).toContain('"Name": "Legacy Product Name"');
        expect(userContent).not.toContain('"source_url"');
        expect(userContent).not.toContain('"image_url"');
    });

    it('applyConsolidationResults merges existing consolidated data and resolves brand ids', async () => {
        const productsIngestionUpsert = jest.fn().mockResolvedValue({ error: null });

        const productsIngestionSelect = {
            in: jest.fn().mockResolvedValue({
                data: [
                    {
                        sku: 'SKU-1',
                        consolidated: {
                            images: ['https://cdn.example.com/existing.jpg'],
                            stock_status: 'in_stock',
                        },
                    },
                ],
                error: null,
            }),
        };

        const brandsSelect = jest.fn().mockResolvedValue({
            data: [{ id: 'brand-uuid-1', name: 'KONG' }],
            error: null,
        });

        const supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn(() => productsIngestionSelect),
                        upsert: productsIngestionUpsert,
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

        (createClient as jest.Mock).mockResolvedValue(supabaseMock);

        const response = await applyConsolidationResults([
            {
                sku: 'SKU-1',
                name: 'KONG Air Dog Squeaker Tennis Ball 3 ct',
                brand: 'KONG',
                description: 'Fetch ball toy for dogs',
                weight: '3',
                category: 'Dog',
                product_type: 'Dog Toys',
                confidence_score: 0.94,
            },
        ]);

        expect('status' in response && response.status === 'applied').toBe(true);
        expect(productsIngestionUpsert).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    pipeline_status: 'finalized',
                    confidence_score: 0.94,
                    error_message: null,
                    consolidated: expect.objectContaining({
                        brand_id: 'brand-uuid-1',
                        brand: 'KONG',
                        images: ['https://cdn.example.com/existing.jpg'],
                        stock_status: 'in_stock',
                    }),
                }),
            ]),
            { onConflict: 'sku' }
        );
    });
});
