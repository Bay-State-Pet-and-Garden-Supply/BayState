import { publishToStorefront } from '@/lib/pipeline/publish';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
    createAdminClient: jest.fn(),
}));

jest.mock('@/lib/product-category-sync', () => ({
    syncProductCategoryLinks: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/product-image-storage', () => ({
    buildProductImageStorageFolder: jest.fn().mockReturnValue('pipeline-published/UPC-1'),
    replaceInlineImageDataUrls: jest.fn().mockImplementation(async (_supabase, value) => ({ value })),
}));

const { createClient, createAdminClient } = require('@/lib/supabase/server');

describe('publishToStorefront', () => {
    let supabaseMock: any;

    beforeEach(() => {
        jest.clearAllMocks();

        const ingestionEq = jest.fn().mockResolvedValue({
            data: {
                upc: 'UPC-1',
                input: { name: 'Test Product', price: 12.99, category: 'Cat / Food' },
                consolidated: {
                    core: {
                        name: 'Test Product',
                        price: 12.99,
                        canonical_category_breadcrumb: 'Cat / Food',
                    },
                    facets: [
                        { definition_slug: 'animal_type', value: 'Cat' },
                        { definition_slug: 'food_form', value: 'Dry' },
                    ],
                    media: [
                        { url: 'https://cdn.example.com/source.jpg', role: 'main', source: 'scraped' }
                    ],
                },
                pipeline_status: 'reviewing',
            },
            error: null,
        });

        const ingestionTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockReturnValue({ single: ingestionEq }),
            })),
            update: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockResolvedValue({ error: null }),
            })),
        };

        const productsEq = jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'product-1' }, error: null }),
        });

        const productsTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: productsEq,
            })),
            update: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockResolvedValue({ error: null }),
            })),
            insert: jest.fn().mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'product-1' }, error: null }),
                }),
            })),
        };

        const facetDefinitionsTable = {
            select: jest.fn().mockImplementation(() => ({
                in: jest.fn().mockResolvedValue({
                    data: [
                        { id: 'def-1', slug: 'animal_type', name: 'Animal Type' },
                        { id: 'def-2', slug: 'food_form', name: 'Food Form' },
                    ],
                    error: null,
                }),
            })),
        };

        const facetValuesTable = {
            upsert: jest.fn().mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: { id: 'val-1' }, error: null }),
                }),
            })),
        };

        const productFacetsTable = {
            delete: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockResolvedValue({ error: null }),
            })),
            insert: jest.fn().mockResolvedValue({ error: null }),
        };

        const categoriesTable = {
            select: jest.fn().mockResolvedValue({
                data: [
                    { id: 'cat-1', name: 'Cat Food', slug: 'cat-food', breadcrumb: 'Cat / Food' }
                ],
                error: null,
            }),
        };

        const externalSourcesTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ext-1' }, error: null }),
                }),
            })),
        };

        const shopsiteProductSyncTable = {
            upsert: jest.fn().mockResolvedValue({ error: null }),
        };

        supabaseMock = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') return ingestionTable;
                if (table === 'products') return productsTable;
                if (table === 'facet_definitions') return facetDefinitionsTable;
                if (table === 'facet_values') return facetValuesTable;
                if (table === 'product_facets') return productFacetsTable;
                if (table === 'categories') return categoriesTable;
                if (table === 'external_sources') return externalSourcesTable;
                if (table === 'shopsite_product_sync') return shopsiteProductSyncTable;
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        createClient.mockResolvedValue(supabaseMock);
        createAdminClient.mockResolvedValue(supabaseMock);
    });

    it('reuses the existing storefront row by UPC without mutating pipeline_status', async () => {
        const result = await publishToStorefront('UPC-1');

        expect(result).toEqual({ success: true, action: 'updated', productId: 'product-1' });
        expect(supabaseMock.from).toHaveBeenCalledWith('products');
        expect(supabaseMock.from).toHaveBeenCalledWith('product_facets');
        expect(supabaseMock.from).toHaveBeenCalledWith('facet_definitions');
        expect(supabaseMock.from).toHaveBeenCalledWith('facet_values');
    });

    it('rejects legacy approved rows that are not in a valid publishable status', async () => {
        const ingestionEq = jest.fn().mockResolvedValue({
            data: {
                upc: 'UPC-2',
                input: { name: 'Legacy Approved Product', price: 9.99 },
                consolidated: { name: 'Legacy Approved Product', price: 9.99, images: [] },
                pipeline_status: 'approved',
            },
            error: null,
        });

        const ingestionTable = {
            select: jest.fn().mockImplementation(() => ({
                eq: jest.fn().mockReturnValue({ single: ingestionEq }),
            })),
        };

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') return ingestionTable;
                throw new Error(`Unexpected table ${table}`);
            }),
        };

        createClient.mockResolvedValue(supabase);

        const result = await publishToStorefront('UPC-2');

        expect(result.success).toBe(false);
        expect(result.error).toContain('must be in reviewing');
    });
});
