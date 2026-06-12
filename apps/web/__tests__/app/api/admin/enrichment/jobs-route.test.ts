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

describe('/api/admin/enrichment/jobs route — automated cascade', () => {
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

    // ===========================================================================
    // Validation
    // ===========================================================================

    it('rejects requests with empty UPCs array', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: [] }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'upcs array is required and must not be empty',
        });
    });

    it('rejects requests without upcs field', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({}),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'upcs array is required and must not be empty',
        });
    });

    it('rejects invalid retryMode', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    upcs: ['UPC-1'],
                    retryMode: 'invalid_mode',
                }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload.error).toContain('Invalid retryMode');
    });

    it('accepts retryMode "all"', async () => {
        // Products query returns empty — we only test that validation passes
        mockSupabase.in.mockResolvedValue({ data: [], error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    upcs: ['UPC-1'],
                    retryMode: 'all',
                }),
            } as any),
        );
        const payload = await response.json();
        // Should reach the "no valid UPCs" check, not the retryMode validation
        expect(response.status).toBe(400);
        expect(payload.error).toContain('None of the selected UPCs are in Imported, Extracting, Processed, or Needs Attention status');
    });

    it('accepts retryMode "failed_or_untried"', async () => {
        mockSupabase.in.mockResolvedValue({ data: [], error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    upcs: ['UPC-1'],
                    retryMode: 'failed_or_untried',
                }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload.error).toContain('None of the selected UPCs are in Imported');
    });

    // ===========================================================================
    // Pipeline status filtering
    // ===========================================================================

    it('accepts imported products', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: { upc: 'UPC-1', brand: { id: 'brand-1', name: 'Test', slug: 'test' }, priority: [] } },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        expect(response.status).toBe(200);
    });

    it('accepts processed products (re-extraction)', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'processed' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: { upc: 'UPC-1', brand: { id: 'brand-1', name: 'Test', slug: 'test' }, priority: [] } },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        expect(response.status).toBe(200);
    });

    it('accepts needs_attention products (re-extraction)', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'needs_attention' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: { upc: 'UPC-1', brand: { id: 'brand-1', name: 'Test', slug: 'test' }, priority: [] } },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        expect(response.status).toBe(200);
    });

    it('rejects products in failed status', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'failed' as string }],
            error: null,
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload.error).toContain('None of the selected UPCs are in Imported');
    });

    // ===========================================================================
    // Source plan building
    // ===========================================================================

    it('rejects when no source plans can be built (unconfigured cascade)', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': {
                ok: false,
                upc: 'UPC-1',
                error: 'Source cascade not configured for brand "TestBrand" (testbrand). Configure distributor priorities in brand settings before extraction.',
                code: 'source_cascade_not_configured',
            },
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload.error).toContain('Source cascade not configured');
    });

    it('rejects when all plans fail with mixed errors', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [
                { upc: 'UPC-1', pipeline_status: 'imported' as string },
                { upc: 'UPC-2', pipeline_status: 'imported' as string },
            ],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': {
                ok: false,
                upc: 'UPC-1',
                error: 'Product has no assigned brand. Assign a brand before extraction.',
                code: 'missing_brand',
            },
            'UPC-2': {
                ok: false,
                upc: 'UPC-2',
                error: 'Source cascade not configured for brand "TestBrand" (testbrand).',
                code: 'source_cascade_not_configured',
            },
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1', 'UPC-2'] }),
            } as any),
        );
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload.error).toContain('has no assigned brand');
    });

    // ===========================================================================
    // Successful job creation
    // ===========================================================================

    it('creates enrichment job and attempts successfully', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        const mockPlan = {
            upc: 'UPC-1',
            brand: { id: 'brand-1', name: 'TestBrand', slug: 'testbrand' },
            input: { name: 'Test', price: 10 },
            priority: [
                { sourceType: 'distributor', sourceSlug: 'phillips', domains: ['phillips.com'], runFirst: false, priority: 10 },
            ],
            sourcePolicy: { allowedDomains: ['phillips.com'], allowedAssetDomains: [], disallowedDomains: [], approvedSourcesOnly: true },
            extractionMode: 'mixed',
            selectedDistributorSlug: null,
            schemaVersion: 'v1',
        };

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: mockPlan },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            jobId: 'job-1',
            upcCount: 1,
            attemptCount: 1,
        });

        // Verify job was created with cascade config, not old fields
        expect(mockSupabase.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'mixed',
                config_id: 'config-1',
                model: 'deepseek-chat',
            }),
        );

        // Verify job config has cascade fields
        const jobInsertCall = mockSupabase.insert.mock.calls.find(
            (args: any[]) => !Array.isArray(args[0])
        );
        if (jobInsertCall) {
            const jobConfig = jobInsertCall[0].config;
            expect(jobConfig.source_type).toBe('approved_source_extraction');
            expect(jobConfig.cascade_version).toBe('v1');
        }
    });

    it('forwards retryMode to buildApprovedSourcePlans', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: { upc: 'UPC-1', brand: { id: 'brand-1', name: 'Test', slug: 'test' }, priority: [] } },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    upcs: ['UPC-1'],
                    retryMode: 'failed_or_untried',
                }),
            } as any),
        );

        expect(buildApprovedSourcePlans).toHaveBeenCalledWith(
            expect.anything(),
            ['UPC-1'],
            { retryMode: 'failed_or_untried' },
        );
    });

    // ===========================================================================
    // Deprecated fields are ignored (not rejected)
    // ===========================================================================

    it('ignores deprecated extractionMode field', async () => {
        // Should not error — just ignore the field
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': { ok: true, plan: { upc: 'UPC-1', brand: { id: 'brand-1', name: 'Test', slug: 'test' }, priority: [] } },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({
                    upcs: ['UPC-1'],
                    extractionMode: 'distributor_only',
                    selectedDistributorSlug: 'phillips',
                }),
            } as any),
        );
        expect(response.status).toBe(200);
    });

    // ===========================================================================
    // No credential preflight
    // ===========================================================================

    it('does not check credentials before creating the job', async () => {
        mockSupabase.in.mockResolvedValueOnce({
            data: [{ upc: 'UPC-1', pipeline_status: 'imported' as string }],
            error: null,
        });

        (buildApprovedSourcePlans as jest.Mock).mockResolvedValue({
            'UPC-1': {
                ok: true,
                plan: {
                    upc: 'UPC-1',
                    priority: [{ requiresAuth: true, credentialRef: 'phillips' }],
                },
            },
        });

        mockSupabase.insert = jest.fn().mockImplementation((arg: any) => {
            if (Array.isArray(arg)) return Promise.resolve({ error: null });
            return mockSupabase;
        });
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        mockSupabase.in.mockResolvedValueOnce({ error: null });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/enrichment/jobs', {
                body: JSON.stringify({ upcs: ['UPC-1'] }),
            } as any),
        );
        expect(response.status).toBe(200);

        // Should NOT have called scraper_credentials table
        mockSupabase.from.mockReturnThis();
        const credentialCalls = mockSupabase.from.mock.calls.filter(
            (args: string[]) => args[0] === 'scraper_credentials'
        );
        expect(credentialCalls.length).toBe(0);
    });
});
