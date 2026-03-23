import { TextDecoder, TextEncoder } from 'util';

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
            status: number;
            headers: any;
            constructor(body: any, init: any) {
                this.body = body;
                this.status = init?.status || 200;
                this.headers = new Map(Object.entries(init?.headers || {}));
            }
            static json(body: any, init?: any) {
                return new (this as any)(body, { ...init, headers: { 'Content-Type': 'application/json' } });
            }
            async json() {
                return this.body;
            }
        },
    };
});

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

const { GET } = require('@/app/api/admin/pipeline/[sku]/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

describe('Pipeline SKU Route API', () => {
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
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
        };

        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('returns 401 when unauthorized', async () => {
        const req = new NextRequest('http://localhost/api/admin/pipeline/SKU-001');
        const res = await GET(req, { params: Promise.resolve({ sku: 'SKU-001' }) });
        expect(res.status).toBe(401);
    });

    it('merges stored, consolidated, selected, and source image candidates', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        mockSupabase.single.mockResolvedValue({
            data: {
                sku: 'SKU-001',
                image_candidates: ['https://example.com/stored.jpg'],
                selected_images: [{ url: 'https://example.com/selected.jpg' }],
                consolidated: {
                    images: ['https://example.com/consolidated.jpg'],
                },
                sources: {
                    chewy: {
                        image_url: 'https://example.com/source.jpg',
                    },
                },
            },
            error: null,
        });

        const req = new NextRequest('http://localhost/api/admin/pipeline/SKU-001');
        const res = await GET(req, { params: Promise.resolve({ sku: 'SKU-001' }) });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.product.image_candidates).toEqual(
            expect.arrayContaining([
                'https://example.com/stored.jpg',
                'https://example.com/selected.jpg',
                'https://example.com/consolidated.jpg',
                'https://example.com/source.jpg',
            ])
        );
    });
});
