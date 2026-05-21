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
import { POST } from '@/app/api/admin/enrichment/jobs/route';

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => {
    const mockCreate = jest.fn();
    return {
        createClient: mockCreate,
        createAdminClient: mockCreate,
    };
});

jest.mock('@/lib/approved-sources/source-plan', () => ({
    buildApprovedSourcePlans: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
    getAIScrapingRuntimeCredentials: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createAdminClient } = require('@/lib/supabase/server');
const { buildApprovedSourcePlans } = require('@/lib/approved-sources/source-plan');
const { getAIScrapingRuntimeCredentials } = require('@/lib/ai-scraping/credentials');

describe('/api/admin/enrichment/jobs route', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue({
            llm_provider: 'deepseek',
            llm_model: 'deepseek-chat',
            llm_base_url: 'https://api.deepseek.com/v1',
            llm_api_key: 'test-key',
            config_id: 'config-1',
        });
        
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
            insert: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
        };
        (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('rejects requests with empty SKUs array', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: [],
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'skus array is required and must not be empty',
        });
    });

    it('rejects approved source extraction if no products found in imported/extracting status', async () => {
        // Mock products_ingestion search to return empty array
        mockSupabase.in.mockResolvedValue({ data: [], error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'None of the selected SKUs are in Imported or Extracting status',
        });
    });

    it('rejects approved source extraction if required credentials are not configured', async () => {
        // 1. Mock products_ingestion search to find SKU
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        // 2. Mock source plan building to return a plan requiring auth for phillips
        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: true,
                plan: {
                    sku: 'SKU-1',
                    priority: [
                        {
                            sourceType: 'distributor',
                            sourceSlug: 'phillips',
                            requiresAuth: true,
                            credentialRef: 'phillips',
                        },
                    ],
                },
            },
        });

        // 3. Mock scraper_credentials query to return empty (missing credentials)
        mockSupabase.in.mockResolvedValueOnce({
            data: [],
            error: null,
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toContain('Scrape cannot be started. Credentials are not configured in Settings for: Phillips Pet (missing: Username and Password)');
    });

    it('succeeds and creates enrichment job when credentials are configured', async () => {
        // 1. Mock products_ingestion search to find SKU
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        // 2. Mock source plan building to return a plan requiring auth for phillips
        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: true,
                plan: {
                    sku: 'SKU-1',
                    priority: [
                        {
                            sourceType: 'distributor',
                            sourceSlug: 'phillips',
                            requiresAuth: true,
                            credentialRef: 'phillips',
                        },
                    ],
                },
            },
        });

        // 3. Mock scraper_credentials query to return both credentials configured
        mockSupabase.in.mockResolvedValueOnce({
            data: [
                { scraper_slug: 'phillips', credential_type: 'login' },
                { scraper_slug: 'phillips', credential_type: 'password' },
            ],
            error: null,
        });

        // 4. Mock enrichment_jobs insert to return mockSupabase for chaining,
        // and mock enrichment_attempts insert to return resolved promise.
        mockSupabase.insert = jest.fn().mockImplementation((arg) => {
            if (Array.isArray(arg)) {
                return Promise.resolve({ error: null });
            }
            return mockSupabase;
        });

        mockSupabase.single.mockResolvedValue({
            data: { id: 'job-1' },
            error: null,
        });

        // 6. Mock products_ingestion status transition update
        mockSupabase.in.mockResolvedValueOnce({
            error: null,
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            jobId: 'job-1',
            skuCount: 1,
            attemptCount: 1,
        });
        expect(mockSupabase.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                config_id: 'config-1',
                model: 'deepseek-chat',
            }),
        );
        expect(mockSupabase.insert).not.toHaveBeenCalledWith(
            expect.objectContaining({ ai_credentials: expect.anything() }),
        );
    });

    it('sets model to null when extractionMode is distributor_only', async () => {
        // 1. Mock products_ingestion search to find SKU
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        // 2. Mock source plan building
        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: true,
                plan: {
                    sku: 'SKU-1',
                    priority: [
                        {
                            sourceType: 'distributor',
                            sourceSlug: 'phillips',
                            requiresAuth: true,
                            credentialRef: 'phillips',
                        },
                    ],
                },
            },
        });

        // 3. Mock scraper_credentials query
        mockSupabase.in.mockResolvedValueOnce({
            data: [
                { scraper_slug: 'phillips', credential_type: 'login' },
                { scraper_slug: 'phillips', credential_type: 'password' },
            ],
            error: null,
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg) => {
            if (Array.isArray(arg)) {
                return Promise.resolve({ error: null });
            }
            return mockSupabase;
        });

        mockSupabase.single.mockResolvedValue({
            data: { id: 'job-1' },
            error: null,
        });

        mockSupabase.in.mockResolvedValueOnce({
            error: null,
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'distributor_only',
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mockSupabase.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                model: null,
            }),
        );
    });

    it('rejects invalid extractionMode', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'invalid_mode',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toContain('Invalid extractionMode');
    });

    it('returns specific error for ai_only when all plans fail', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: false,
                sku: 'SKU-1',
                error: 'AI-only mode requested but all sources already enriched within 48h. Use forceRefresh to re-scrape.',
            },
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'ai_only',
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toContain('AI-only extraction requires products to have official brand domains configured');
    });

    it('returns specific error for distributor_only when all plans fail', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: false,
                sku: 'SKU-1',
                error: 'No approved sources configured for brand TestBrand (testbrand). Configure brand sources in the admin panel before extraction.',
            },
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'distributor_only',
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toContain('Distributor-only extraction requires at least one distributor source to be configured');
    });

    it('returns success with a skip message when all requested sources are already fresh', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: false,
                sku: 'SKU-1',
                code: 'all_sources_fresh',
                error: 'All requested approved sources are already fresh. Use forceRefresh to re-scrape.',
            },
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'distributor_only',
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            jobId: null,
            skuCount: 0,
            attemptCount: 0,
            skipped_skus: ['SKU-1'],
            message: 'All requested approved sources are already fresh. Use Force refresh to re-scrape.',
        });
    });

    it('stores extractionMode and forceRefresh in jobConfig', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'SKU-1': {
                ok: true,
                plan: {
                    sku: 'SKU-1',
                    priority: [],
                },
            },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg) => {
            if (Array.isArray(arg)) {
                return Promise.resolve({ error: null });
            }
            return mockSupabase;
        });

        mockSupabase.single.mockResolvedValue({
            data: { id: 'job-1' },
            error: null,
        });

        mockSupabase.in.mockResolvedValueOnce({
            error: null,
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    extractionMode: 'ai_only',
                    forceRefresh: true,
                    config: {
                        source_type: 'approved_source_extraction',
                    },
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);

        const insertCalls = mockSupabase.insert.mock.calls;
        const jobInsertCall = insertCalls.find(
            (call: any) => call[0] && call[0].config && call[0].config.extraction_mode === 'ai_only',
        );
        expect(jobInsertCall).toBeTruthy();
        expect(jobInsertCall[0].config.force_refresh).toBe(true);
    });
});
