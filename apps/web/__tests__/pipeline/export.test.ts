import { TextEncoder, TextDecoder } from 'util';

// Polyfills for Node environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === 'undefined') {
    // @ts-ignore
    const { ReadableStream } = require('stream/web');
    global.ReadableStream = ReadableStream;
}

// Mock next/server
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
        }
    };
});

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

// Require modules
const { GET } = require('@/app/api/admin/pipeline/export/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

describe('CSV Export API', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Auth
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
        });

        // Mock Supabase
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            range: jest.fn(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should generate CSV with correct headers and data', async () => {
        // Mock data
        const mockData = [
            {
                sku: 'SKU-123',
                input: { name: 'Test Product', price: 10.99 },
                consolidated: { name: 'Consolidated Name', price: 12.99 },
                pipeline_status: 'staging',
                confidence_score: 0.95,
                updated_at: '2023-01-01T00:00:00Z',
            },
        ];

        // Mock range response
        mockSupabase.range.mockResolvedValueOnce({ data: mockData, error: null });
        mockSupabase.range.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/export?status=staging');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
        expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="pipeline-export-staging');

        // Read stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let csv = '';
        
        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                csv += decoder.decode(value);
            }
        }

        // Verify CSV content
        const lines = csv.trim().split('\n');
        expect(lines[0]).toBe('sku,name,price,status,confidence_score,updated_at');
        expect(lines[1]).toContain('"SKU-123","Consolidated Name",12.99,staging,0.95,2023-01-01T00:00:00Z');
    });

    it('should respect search filter', async () => {
        mockSupabase.range.mockResolvedValue({ data: [], error: null });

        const req = new NextRequest('http://localhost/api/admin/pipeline/export?status=staging&search=test');
        await GET(req);

        expect(mockSupabase.or).toHaveBeenCalledWith(expect.stringContaining('test'));
    });
});
