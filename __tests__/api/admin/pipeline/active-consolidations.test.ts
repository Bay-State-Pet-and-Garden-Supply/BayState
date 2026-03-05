import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === 'undefined') {
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
            json() {
                return Promise.resolve(this.body);
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

const { GET } = require('@/app/api/admin/pipeline/active-consolidations/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

describe('Active Consolidations API', () => {
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
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should return 401 if not authorized', async () => {
        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it('should return active consolidation jobs', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        const mockJobs = [
            {
                id: 'batch-1',
                status: 'in_progress',
                created_at: '2024-01-15T10:00:00Z',
                total_requests: 100,
                completed_requests: 50,
                failed_requests: 5,
            },
            {
                id: 'batch-2',
                status: 'validating',
                created_at: '2024-01-15T09:00:00Z',
                total_requests: 200,
                completed_requests: 0,
                failed_requests: 0,
            },
        ];

        mockSupabase.order.mockReturnValueOnce({
            data: mockJobs,
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.jobs).toHaveLength(2);

        expect(json.jobs[0]).toEqual({
            id: 'batch-1',
            status: 'in_progress',
            totalProducts: 100,
            processedCount: 55,
            successCount: 50,
            errorCount: 5,
            createdAt: '2024-01-15T10:00:00Z',
            progress: 55,
        });

        expect(json.jobs[1]).toEqual({
            id: 'batch-2',
            status: 'validating',
            totalProducts: 200,
            processedCount: 0,
            successCount: 0,
            errorCount: 0,
            createdAt: '2024-01-15T09:00:00Z',
            progress: 0,
        });
    });

    it('should filter out completed, failed, and expired jobs', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.order.mockReturnValueOnce({
            data: [],
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        await GET(req);

        expect(mockSupabase.not).toHaveBeenCalledWith('status', 'in', ['completed', 'failed', 'expired']);
    });

    it('should order by created_at DESC', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.order.mockReturnValueOnce({
            data: [],
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        await GET(req);

        expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should return empty array when no active jobs', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.order.mockReturnValueOnce({
            data: [],
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
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

        mockSupabase.order.mockReturnValueOnce({
            data: null,
            error: { message: 'Database error' },
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        const res = await GET(req);

        expect(res.status).toBe(500);
    });

    it('should calculate progress correctly with zero total', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        const mockJobs = [
            {
                id: 'batch-edge',
                status: 'in_progress',
                created_at: '2024-01-15T10:00:00Z',
                total_requests: 0,
                completed_requests: 0,
                failed_requests: 0,
            },
        ];

        mockSupabase.order.mockReturnValueOnce({
            data: mockJobs,
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/active-consolidations');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.jobs[0].progress).toBe(0);
        expect(json.jobs[0].processedCount).toBe(0);
    });
});
