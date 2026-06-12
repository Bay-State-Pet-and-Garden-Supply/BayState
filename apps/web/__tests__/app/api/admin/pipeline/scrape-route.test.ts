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
import { POST } from '@/app/api/admin/pipeline/scrape/route';

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/pipeline-scraping', () => ({
    scrapeProducts: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { scrapeProducts } = require('@/lib/pipeline-scraping');

describe('/api/admin/pipeline/scrape route (deprecated)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
    });

    it('returns 410 Gone for any request', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(payload.error).toContain('deprecated');
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('returns 410 Gone even for empty body', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({}),
            } as any),
        );

        expect(response.status).toBe(410);
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('returns 401 when not authorized (before deprecation check)', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: false, response: new (require('next/server').NextResponse)(null, { status: 401 }) });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );

        expect(response.status).toBe(401);
        expect(scrapeProducts).not.toHaveBeenCalled();
    });
});
