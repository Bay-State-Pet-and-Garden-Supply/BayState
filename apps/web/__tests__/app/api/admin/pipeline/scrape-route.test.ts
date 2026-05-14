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

describe('/api/admin/pipeline/scrape route (static-only)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
        (scrapeProducts as jest.Mock).mockResolvedValue({ success: true, jobIds: ['job-1'] });
    });

    it('rejects requests without skus', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({ scrapers: ['amazon'] }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({ error: 'SKUs array is required' });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects requests without scrapers', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({ skus: ['SKU-1'] }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({ error: 'Scrapers array is required' });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects legacy enrichment_method field', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    enrichment_method: 'official_brand',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toMatchObject({ error: expect.stringContaining('enrichment_method') });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects legacy cohort_id field', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    cohort_id: 'cohort-1',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toMatchObject({ error: expect.stringContaining('cohort_id') });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects legacy deep_research field', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    deep_research: true,
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toMatchObject({ error: expect.stringContaining('deep_research') });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects legacy urls_by_sku field', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    urls_by_sku: { 'SKU-1': 'https://example.com' },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toMatchObject({ error: expect.stringContaining('urls_by_sku') });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('creates static scraper jobs with valid parameters', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1', 'SKU-2'],
                    scrapers: ['amazon', 'chewy'],
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({
            success: true,
            jobIds: ['job-1'],
            skuCount: 2,
            scraperCount: 2,
        });
        expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1', 'SKU-2'], {
            scrapers: ['amazon', 'chewy'],
            testMode: false,
        });
    });

    it('creates static scraper jobs with empty scrapers array (all scrapers)', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({ success: true, jobIds: ['job-1'] });
        expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'], {
            scrapers: [],
            testMode: false,
        });
    });

    it('passes testMode when set to true', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: ['amazon'],
                    testMode: true,
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'], {
            scrapers: ['amazon'],
            testMode: true,
        });
    });

    it('handles scrapeProducts failure', async () => {
        (scrapeProducts as jest.Mock).mockResolvedValue({
            success: false,
            error: 'No valid scrapers found',
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: ['nonexistent'],
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toMatchObject({ error: expect.stringContaining('No valid scrapers found') });
    });

    it('rejects invalid request body', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: 'not-json' as any,
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
    });
});
