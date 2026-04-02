import { publishToStorefront } from '@/lib/pipeline/publish';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/product-category-sync', () => ({
    syncProductCategoryLinks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/product-image-storage', () => ({
    buildProductImageStorageFolder: jest.fn().mockReturnValue('pipeline-published/SKU-1'),
    replaceInlineImageDataUrls: jest.fn().mockImplementation(async (_supabase, value) => ({ value })),
}));

const { createClient } = require('@/lib/supabase/server');

describe('publishToStorefront', () => {
    it('reuses the existing storefront row by SKU and never writes published back to ingestion', async () => {
        const ingestionEq = jest.fn().mockResolvedValue({
            data: {
                sku: 'SKU-1',
                input: { name: 'Test Product', price: 12.99 },
                consolidated: { name: 'Test Product', price: 12.99, images: ['https://cdn.example.com/source.jpg'] },
                pipeline_status: 'finalized',
            },
            error: null,
        });

        const productsEq = jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'product-1' }, error: null }),
        });

        const updateEq = jest.fn().mockResolvedValue({ error: null });

        const productsTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: productsEq,
            })),
            update: jest.fn().mockImplementation((payload) => ({
                eq: updateEq,
            })),
            insert: jest.fn(),
        };

        const ingestionTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockReturnValue({ single: ingestionEq }),
            })),
            update: jest.fn(),
        };

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') return ingestionTable;
                if (table === 'products') return productsTable;
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(supabase);

        const result = await publishToStorefront('SKU-1');

        expect(result).toEqual({ success: true, action: 'updated', productId: 'product-1' });
        expect(productsEq).toHaveBeenCalledWith('sku', 'SKU-1');
        expect(ingestionTable.update).not.toHaveBeenCalledWith(
            expect.objectContaining({ pipeline_status: 'published' }),
        );
        expect(productsTable.update).toHaveBeenCalled();
    });

    it('allows legacy approved rows to publish during compatibility migration', async () => {
        const ingestionEq = jest.fn().mockResolvedValue({
            data: {
                sku: 'SKU-2',
                input: { name: 'Legacy Approved Product', price: 9.99 },
                consolidated: { name: 'Legacy Approved Product', price: 9.99, images: [] },
                pipeline_status: 'approved',
            },
            error: null,
        });

        const productsEq = jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        });

        const insertSingle = jest.fn().mockResolvedValue({ data: { id: 'product-2' }, error: null });

        const productsTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: productsEq,
            })),
            update: jest.fn(),
            insert: jest.fn().mockImplementation(() => ({
                select: jest.fn().mockReturnValue({ single: insertSingle }),
            })),
        };

        const ingestionTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockReturnValue({ single: ingestionEq }),
            })),
            update: jest.fn(),
        };

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') return ingestionTable;
                if (table === 'products') return productsTable;
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(supabase);

        const result = await publishToStorefront('SKU-2');

        expect(result).toEqual({ success: true, action: 'created', productId: 'product-2' });
        expect(productsTable.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                sku: 'SKU-2',
                name: 'Legacy Approved Product',
            })
        );
    });
});
