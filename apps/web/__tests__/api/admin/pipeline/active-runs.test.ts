import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === 'undefined') {
    // @ts-ignore
    const { ReadableStream } = require('stream/web');
    global.ReadableStream = ReadableStream;
}

jest.mock('next/server', () => {
    return {
        NextRequest: class {
            nextUrl: URL;
            constructor(url: string) {
                this.nextUrl = new URL(url);
            }
        },
        NextResponse: class {
            body: any;
            headers: any;
            status: number;
            constructor(body: any, init: any) {
                this.body = body;
                this.headers = new Map(Object.entries(init?.headers || {}));
                this.status = init?.status || 200;
            }
            static json(body: any, init?: any) {
                return new (this as any)(body, { ...init, headers: { 'Content-Type': 'application/json' } });
            }
            async json() {
                return this.body;
            }
        }
    };
});

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

const { GET } = require('@/app/api/admin/pipeline/active-runs/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

describe('Active Runs API', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();

        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: false,
            response: { status: 401 },
        });

        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should return 401 if not authorized', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: false,
            response: { status: 401 },
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        const res = await GET(req);

        expect(res.status).toBe(401);
    });

    it('should return active jobs with progress', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        const mockJobs = [
            {
                id: 'job-1',
                status: 'running',
                created_at: '2024-01-15T10:00:00Z',
                scrapers: ['amazon', 'walmart'],
                skus: ['SKU-001', 'SKU-002', 'SKU-003'],
            },
            {
                id: 'job-2',
                status: 'pending',
                created_at: '2024-01-15T09:00:00Z',
                scrapers: ['target'],
                skus: ['SKU-004', 'SKU-005'],
            },
        ];

        const mockChunks = [
            { job_id: 'job-1', status: 'completed', chunk_index: 0 },
            { job_id: 'job-1', status: 'completed', chunk_index: 1 },
            { job_id: 'job-1', status: 'running', chunk_index: 2 },
            { job_id: 'job-1', status: 'pending', chunk_index: 3 },
            { job_id: 'job-2', status: 'pending', chunk_index: 0 },
        ];

        mockSupabase.limit.mockResolvedValueOnce({ data: mockJobs, error: null });
        mockSupabase.in.mockResolvedValueOnce({ data: mockChunks, error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        const res = await GET(req);

        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.jobs).toHaveLength(2);

        expect(json.jobs[0]).toEqual({
            id: 'job-1',
            status: 'running',
            createdAt: '2024-01-15T10:00:00Z',
            scrapers: ['amazon', 'walmart'],
            skuCount: 3,
            progress: 50,
        });

        expect(json.jobs[1]).toEqual({
            id: 'job-2',
            status: 'pending',
            createdAt: '2024-01-15T09:00:00Z',
            scrapers: ['target'],
            skuCount: 2,
            progress: 0,
        });
    });

    it('should query for pending and running jobs correctly using .or()', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        await GET(req);

        expect(mockSupabase.or).toHaveBeenCalledWith(expect.stringContaining('status.in.(pending,running)'));
    });

    it('should order by created_at DESC', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        await GET(req);

        expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should return empty array when no active jobs', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
        mockSupabase.in.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.jobs).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-runs');
        const res = await GET(req);

        expect(res.status).toBe(500);
    });
});
