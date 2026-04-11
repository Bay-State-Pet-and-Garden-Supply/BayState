jest.mock('next/server', () => ({
    NextRequest: class {
        nextUrl: URL;
        private readonly requestBody: unknown;

        constructor(url: string, init?: { body?: unknown }) {
            this.nextUrl = new URL(url);
            this.requestBody = init?.body;
        }

        async json() {
            if (typeof this.requestBody === 'string') {
                return JSON.parse(this.requestBody);
            }

            return this.requestBody;
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
import { GET, POST } from '@/app/api/admin/pipeline/route';

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/pipeline', () => ({
    getProductsByStatus: jest.fn(),
    getProductsByStage: jest.fn(),
    getSkusByStatus: jest.fn(),
    getSkusByStage: jest.fn(),
    getAvailableSources: jest.fn(),
    getAvailableSourcesByStage: jest.fn(),
    bulkUpdateStatus: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { getProductsByStatus, getSkusByStatus, getAvailableSources, bulkUpdateStatus } = require('@/lib/pipeline');

describe('/api/admin/pipeline route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
        (getAvailableSources as jest.Mock).mockResolvedValue([]);
    });

    it('lists canonical statuses with the requested filters', async () => {
        (getProductsByStatus as jest.Mock).mockResolvedValue({
            products: [{ sku: 'SKU-1', pipeline_status: 'scraped' }],
            count: 1,
        });

        const response = await GET(
            new NextRequest(
                'http://localhost/api/admin/pipeline?status=scraped&search=hero&limit=25&offset=5&source=amazon&startDate=2026-01-01&endDate=2026-01-31&minConfidence=0.4&maxConfidence=0.9'
            )
        );
        const payload = await response.json();

        expect(getProductsByStatus).toHaveBeenCalledWith('scraped', {
            limit: 25,
            offset: 5,
            search: 'hero',
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            source: 'amazon',
            product_line: undefined,
            cohort_id: undefined,
            minConfidence: 0.4,
            maxConfidence: 0.9,
        });
        expect(payload).toEqual({
            products: [{ sku: 'SKU-1', pipeline_status: 'scraped' }],
            count: 1,
            availableSources: [],
        });
    });

    it('uses canonical status filtering for select-all requests', async () => {
        (getSkusByStatus as jest.Mock).mockResolvedValue({
            skus: ['SKU-1', 'SKU-2'],
            count: 2,
        });

        const response = await GET(
            new NextRequest('http://localhost/api/admin/pipeline?status=finalized&selectAll=true&source=chewy')
        );
        const payload = await response.json();

        expect(getSkusByStatus).toHaveBeenCalledWith('finalized', {
            search: undefined,
            startDate: undefined,
            endDate: undefined,
            source: 'chewy',
            product_line: undefined,
            cohort_id: undefined,
            minConfidence: undefined,
            maxConfidence: undefined,
        });
        expect(payload).toEqual({ skus: ['SKU-1', 'SKU-2'], count: 2 });
    });

    it('rejects legacy status filters at the route boundary', async () => {
        const response = await GET(new NextRequest('http://localhost/api/admin/pipeline?status=consolidated'));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(getProductsByStatus).not.toHaveBeenCalled();
        expect(payload).toEqual({
            error: "Invalid status 'consolidated'. Allowed persisted statuses: 'imported', 'scraped', 'finalized', 'failed'",
        });
    });

    it('rejects derived publish status updates at the mutation boundary', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline', {
                body: JSON.stringify({ skus: ['SKU-1'], newStatus: 'published' }),
            } as any)
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(bulkUpdateStatus).not.toHaveBeenCalled();
        expect(payload).toEqual({
            error: "Published is no longer a pipeline status. Use /api/admin/pipeline/publish and manage synced products from the export tab.",
        });
    });
});
