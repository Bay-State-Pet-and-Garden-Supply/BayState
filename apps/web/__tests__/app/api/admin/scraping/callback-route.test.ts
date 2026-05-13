jest.mock('next/server', () => ({
    NextRequest: class {
        private readonly bodyText: string;
        readonly headers: Headers;

        constructor(_url: string, init?: { body?: string; headers?: Record<string, string> }) {
            this.bodyText = init?.body ?? '';
            const headerMap = new Map<string, string>();
            Object.entries(init?.headers ?? {}).forEach(([key, value]) => {
                headerMap.set(key.toLowerCase(), value);
            });
            this.headers = {
                get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
            } as Headers;
        }

        async text() {
            return this.bodyText;
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
import { POST } from '@/app/api/admin/scraping/callback/route';

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

jest.mock('@/lib/scraper-callback/contract', () => ({
    parseScraperCallbackPayload: jest.fn(),
    isCallbackValidationSuccess: jest.fn(() => true),
}));

jest.mock('@/lib/scraper-callback/idempotency', () => ({
    checkIdempotency: jest.fn(),
    recordCallbackProcessedWithRetry: jest.fn(),
}));

jest.mock('@/lib/scraper-callback/products-ingestion', () => ({
    persistProductsIngestionSourcesPartial: jest.fn(),
}));

const { createClient } = require('@supabase/supabase-js');
const { validateRunnerAuth } = require('@/lib/scraper-auth');
const { parseScraperCallbackPayload } = require('@/lib/scraper-callback/contract');
const { checkIdempotency, recordCallbackProcessedWithRetry } = require('@/lib/scraper-callback/idempotency');
const { persistProductsIngestionSourcesPartial } = require('@/lib/scraper-callback/products-ingestion');

function buildSupabaseMock() {
    const scrapeJobsUpdateEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const scrapeJobsUpdateSelectMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null });
    const scrapeJobsUpdateSelect = jest.fn().mockReturnValue({ maybeSingle: scrapeJobsUpdateSelectMaybeSingle });
    const scrapeJobsUpdateEqWithSelect = jest.fn().mockReturnValue({ select: scrapeJobsUpdateSelect, maybeSingle: scrapeJobsUpdateSelectMaybeSingle });
    const scrapeJobsUpdate = jest.fn().mockReturnValue({ eq: scrapeJobsUpdateEqWithSelect });

    const scrapeJobsSingle = jest
        .fn()
        .mockResolvedValueOnce({
            data: {
                id: 'job-1',
                type: 'ai_search',
                status: 'running',
                lease_token: null,
                attempt_count: 0,
                max_attempts: 3,
                skus: ['SKU-VALID', 'SKU-INVALID'],
                config: {
                    cohort: {
                        officialDomains: ['scottsmiraclegro.com'],
                    },
                },
                metadata: { requested_job_type: 'official_brand' },
            },
            error: null,
        })
        .mockResolvedValueOnce({
            data: {
                metadata: { requested_job_type: 'official_brand' },
            },
            error: null,
        })
        .mockResolvedValueOnce({
            data: {
                test_mode: false,
                metadata: {},
            },
            error: null,
        });

    const scrapeJobsSelectEq = jest.fn().mockReturnValue({ single: scrapeJobsSingle });
    const scrapeJobsSelect = jest.fn().mockReturnValue({ eq: scrapeJobsSelectEq });

    const productsUpdateEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });
    const productsUpdateIn = jest.fn().mockReturnValue({ eq: productsUpdateEq });
    const productsUpdate = jest.fn().mockReturnValue({ in: productsUpdateIn });

    const from = jest.fn((table: string) => {
        if (table === 'scrape_jobs') {
            return {
                select: scrapeJobsSelect,
                update: scrapeJobsUpdate,
            };
        }

        if (table === 'scraper_runners') {
            return {
                update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
            };
        }

        if (table === 'products_ingestion') {
            return {
                update: productsUpdate,
            };
        }

        if (table === 'scrape_job_logs') {
            return {
                upsert: jest.fn().mockResolvedValue({ error: null }),
            };
        }

        throw new Error(`Unexpected table ${table}`);
    });

    return {
        from,
        scrapeJobsUpdate,
        scrapeJobsUpdateEq,
    };
}

describe('/api/admin/scraping/callback route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SECRET_KEY = 'service-role-key';
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'runner-1', authMethod: 'api_key' });
        (parseScraperCallbackPayload as jest.Mock).mockReturnValue({
            success: true,
            payload: {
                job_id: 'job-1',
                status: 'completed',
                runner_name: 'runner-1',
                results: {
                    data: {
                        'SKU-VALID': {
                            official_brand: {
                                title: 'Valid Product',
                                brand: 'Miracle-Gro',
                                url: 'https://www.scottsmiraclegro.com/products/a',
                                source_website: 'https://www.scottsmiraclegro.com/products/a',
                                confidence: 0.92,
                                images: ['https://cdn.example.com/a.jpg'],
                            },
                        },
                        'SKU-INVALID': {
                            official_brand: {
                                title: 'Invalid Product',
                                brand: 'Miracle-Gro',
                                url: 'https://www.amazon.com/products/a',
                                source_website: 'https://www.amazon.com/products/a',
                                confidence: 0.95,
                                images: ['https://cdn.example.com/a.jpg'],
                            },
                        },
                    },
                },
            },
        });
        (checkIdempotency as jest.Mock).mockResolvedValue({ isDuplicate: false, key: 'admin:job-1' });
        (recordCallbackProcessedWithRetry as jest.Mock).mockResolvedValue({ success: true });
    });

    it('persists only accepted official brand results on mixed callbacks', async () => {
        const supabase = buildSupabaseMock();
        (createClient as jest.Mock).mockReturnValue(supabase);
        (persistProductsIngestionSourcesPartial as jest.Mock).mockResolvedValue({ persisted: ['SKU-VALID'], missing: [] });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/scraping/callback', {
                body: JSON.stringify({}),
                headers: { 'X-API-Key': 'bsr_test' },
            } as any),
        );

        expect(response.status).toBe(200);
        expect(persistProductsIngestionSourcesPartial).toHaveBeenCalledWith(
            expect.any(Object),
            {
                'SKU-VALID': expect.any(Object),
            },
            false,
            expect.any(String),
        );
    });

    it('marks job failed when official brand has zero accepted results', async () => {
        const supabase = buildSupabaseMock();
        (createClient as jest.Mock).mockReturnValue(supabase);
        (persistProductsIngestionSourcesPartial as jest.Mock).mockResolvedValue({ persisted: [], missing: [] });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/scraping/callback', {
                body: JSON.stringify({}),
                headers: { 'X-API-Key': 'bsr_test' },
            } as any),
        );

        const payload = await response.json();
        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true });
        expect(supabase.scrapeJobsUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'failed',
                error_message: 'Official Brand returned no consolidation-ready results',
            }),
        );
    });
});
