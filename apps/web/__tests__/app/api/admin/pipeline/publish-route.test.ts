jest.mock('next/server', () => ({
    NextRequest: class {
        nextUrl: URL;

        constructor(url: string) {
            this.nextUrl = new URL(url);
        }
    },
    NextResponse: class {
        body: unknown;
        status: number;

        constructor(body: unknown, init?: { status?: number }) {
            this.body = body;
            this.status = init?.status ?? 200;
        }

        static json(body: unknown, init?: { status?: number }) {
            return new this(body, init);
        }

        async json() {
            return this.body;
        }
    },
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/pipeline/publish/route';

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createClient } = require('@/lib/supabase/server');

describe('GET /api/admin/pipeline/publish', () => {
    it('derives storefront presence from the matching products.sku row', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });

        const ingestionEq = jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
                data: {
                    sku: 'SKU-1',
                    pipeline_status: 'finalized',
                    consolidated: { name: 'New Name' },
                    input: { name: 'Old Name' },
                },
                error: null,
            }),
        });

        const productsEq = jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'product-1', sku: 'SKU-1', slug: 'different-slug' },
                error: null,
            }),
        });

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn().mockReturnValue({ eq: ingestionEq }),
                    };
                }

                if (table === 'products') {
                    return {
                        select: jest.fn().mockReturnValue({ eq: productsEq }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(supabase);

        const response = await GET(new NextRequest('http://localhost/api/admin/pipeline/publish?sku=SKU-1'));
        const payload = await response.json();

        expect(productsEq).toHaveBeenCalledWith('sku', 'SKU-1');
        expect(payload).toMatchObject({
            sku: 'SKU-1',
            pipelineStatus: 'finalized',
            inStorefront: true,
            storefrontProductId: 'product-1',
        });
    });

    it('derives storefront presence from sku existence instead of requiring finalized status', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });

        const ingestionEq = jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
                data: {
                    sku: 'SKU-2',
                    pipeline_status: 'imported',
                    consolidated: null,
                    input: { name: 'Imported Product' },
                },
                error: null,
            }),
        });

        const productsEq = jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'product-2', sku: 'SKU-2', slug: 'imported-product-sku-2' },
                error: null,
            }),
        });

        const supabase = {
            from: jest.fn((table: string) => {
                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn().mockReturnValue({ eq: ingestionEq }),
                    };
                }

                if (table === 'products') {
                    return {
                        select: jest.fn().mockReturnValue({ eq: productsEq }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(supabase);

        const response = await GET(new NextRequest('http://localhost/api/admin/pipeline/publish?sku=SKU-2'));
        const payload = await response.json();

        expect(payload).toMatchObject({
            sku: 'SKU-2',
            pipelineStatus: 'imported',
            inStorefront: true,
            storefrontProductId: 'product-2',
        });
    });
});
