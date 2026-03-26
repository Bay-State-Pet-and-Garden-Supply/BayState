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

const { GET, PATCH } = require('@/app/api/admin/pipeline/[sku]/route');
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
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
            storage: {
                from: jest.fn(() => ({
                    upload: jest.fn().mockResolvedValue({ error: null }),
                    getPublicUrl: jest.fn((path: string) => ({
                        data: { publicUrl: `https://cdn.example.com/${path}` },
                    })),
                })),
            },
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

    it('migrates inline consolidated images to storage URLs on PATCH', async () => {
        (requireAdminAuth as jest.Mock).mockResolvedValue({
            authorized: true,
            user: { id: 'user-123' },
            role: 'admin',
        });

        const updateEqMock = jest.fn().mockResolvedValue({ error: null });
        mockSupabase.update.mockReturnValue({ eq: updateEqMock });

        const testReq = class extends NextRequest {
            async json() {
                return {
                    consolidated: {
                        images: ['data:image/png;base64,QUJD'],
                    },
                };
            }
        };
        const req = new (testReq as any)('http://localhost/api/admin/pipeline/SKU-001', {
            method: 'PATCH',
        });
        const res = await PATCH(req, { params: Promise.resolve({ sku: 'SKU-001' }) });

        expect(res.status).toBe(200);
        expect(mockSupabase.storage.from).toHaveBeenCalledWith('product-images');
        expect(mockSupabase.update).toHaveBeenCalledWith(
            expect.objectContaining({
                consolidated: {
                    images: ['https://cdn.example.com/pipeline-consolidated/sku-001/b5d4045c3f466fa91fe2cc6a.png'],
                },
            })
        );
    });
});
