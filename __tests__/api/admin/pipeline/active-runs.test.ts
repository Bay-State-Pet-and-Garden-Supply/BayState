jest.mock('next/server', () => ({
    NextRequest: class MockNextRequest {
        headers: Headers;
        url: string;
        nextUrl: URL;
        constructor(input: string | Request | URL, init?: RequestInit) {
            this.url = typeof input === 'string' ? input : 'http://localhost';
            this.nextUrl = new URL(this.url);
            this.headers = new Headers(init?.headers || {});
        }
        async json() { return {}; }
    },
    NextResponse: {
        json: (data: unknown, init?: ResponseInit) => {
            const status = init?.status || 200;
            return {
                status,
                json: async () => data,
                ok: status >= 200 && status < 300,
            };
        }
    }
}));

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

const mockRequireAdminAuth = requireAdminAuth as jest.MockedFunction<typeof requireAdminAuth>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('GET /api/admin/pipeline/active-runs', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSupabase = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    in: jest.fn().mockReturnValue({
                        order: jest.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                }),
            }),
        };

        mockCreateClient.mockResolvedValue(mockSupabase);
        mockRequireAdminAuth.mockResolvedValue({ 
            authorized: true, 
            response: null, 
            user: { id: 'admin-1' },
            role: 'admin',
        });
    });

    it('returns 401 when user is not authenticated', async () => {
        mockRequireAdminAuth.mockResolvedValue({ 
            authorized: false, 
            response: { status: 401, json: async () => ({ error: 'Unauthorized' }) } as any,
            user: null,
        });

        const { GET } = await import('@/app/api/admin/pipeline/active-runs/route');
        
        const request = new (await import('next/server')).NextRequest('http://localhost:3000/api/admin/pipeline/active-runs');
        const response = await GET(request);

        expect(response.status).toBe(401);
    });

    it('returns active jobs with pending status', async () => {
        const mockJobs = [
            {
                id: 'job-1',
                status: 'pending',
                scrapers: ['petfoodex', 'amazon'],
                created_at: '2026-03-01T10:00:00Z',
                skus: ['sku1', 'sku2'],
            },
            {
                id: 'job-2',
                status: 'running',
                scrapers: ['bradley'],
                created_at: '2026-03-01T09:00:00Z',
                skus: ['sku3'],
            },
        ];

        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'scrape_jobs') {
                return {
                    select: () => ({
                        in: () => ({
                            order: () => Promise.resolve({ data: mockJobs, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'scrape_job_chunks') {
                return {
                    select: () => ({
                        eq: () => Promise.resolve({ 
                            data: [{ status: 'completed' }, { status: 'pending' }], 
                            error: null 
                        }),
                    }),
                };
            }
            return { select: () => ({}) };
        });

        const { GET } = await import('@/app/api/admin/pipeline/active-runs/route');
        
        const { NextRequest } = await import('next/server');
        const request = new NextRequest('http://localhost:3000/api/admin/pipeline/active-runs');
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await (response as any).json();
        
        expect(data.jobs).toBeDefined();
        expect(Array.isArray(data.jobs)).toBe(true);
    });

    it('returns empty array when no active jobs', async () => {
        mockSupabase.from.mockReturnValue({
            select: () => ({
                in: () => ({
                    order: () => Promise.resolve({ data: [], error: null }),
                }),
            }),
        });

        const { GET } = await import('@/app/api/admin/pipeline/active-runs/route');
        
        const { NextRequest } = await import('next/server');
        const request = new NextRequest('http://localhost:3000/api/admin/pipeline/active-runs');
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await (response as any).json();
        
        expect(data.jobs).toEqual([]);
    });

    it('includes correct job fields in response', async () => {
        const mockJobsData = [
            {
                id: 'job-test-123',
                status: 'running',
                scrapers: ['test-scraper'],
                created_at: '2026-03-01T12:00:00Z',
                skus: ['sku1', 'sku2', 'sku3'],
            },
        ];

        const mockChunks = [
            { status: 'completed' },
            { status: 'completed' },
            { status: 'running' },
        ];

        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'scrape_jobs') {
                return {
                    select: () => ({
                        in: () => ({
                            order: () => Promise.resolve({ data: mockJobsData, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'scrape_job_chunks') {
                return {
                    select: () => ({
                        eq: () => Promise.resolve({ data: mockChunks, error: null }),
                    }),
                };
            }
            return { select: () => ({}) };
        });

        const { GET } = await import('@/app/api/admin/pipeline/active-runs/route');
        
        const { NextRequest } = await import('next/server');
        const request = new NextRequest('http://localhost:3000/api/admin/pipeline/active-runs');
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await (response as any).json();
        
        expect(data.jobs).toHaveLength(1);
        const job = data.jobs[0];
        
        expect(job.id).toBe('job-test-123');
        expect(job.status).toBe('running');
        expect(job.scrapers).toEqual(['test-scraper']);
        expect(job.createdAt).toBe('2026-03-01T12:00:00Z');
        expect(job.skuCount).toBe(3);
        expect(job.progress).toEqual({ completed: 2, total: 3 });
    });

    it('handles database errors', async () => {
        mockSupabase.from.mockReturnValue({
            select: () => ({
                in: () => ({
                    order: () => Promise.resolve({ data: null, error: 'Database error' }),
                }),
            }),
        });

        const { GET } = await import('@/app/api/admin/pipeline/active-runs/route');
        
        const { NextRequest } = await import('next/server');
        const request = new NextRequest('http://localhost:3000/api/admin/pipeline/active-runs');
        const response = await GET(request);

        expect(response.status).toBe(500);
        const data = await (response as any).json();
        
        expect(data.error).toBe('Failed to fetch active jobs');
    });
});
