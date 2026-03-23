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
            bodyUsed: boolean = false;
            constructor(url: string) {
                this.nextUrl = new URL(url);
            }
            async json() {
                return {};
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
                const response = new (this as any)(body, { ...init, headers: { 'Content-Type': 'application/json' } });
                response._isJson = true;
                return response;
            }
            async json() {
                return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
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

const { GET, POST } = require('@/app/api/admin/pipeline/images/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

describe('Images Pipeline API', () => {
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
            neq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            single: jest.fn(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    describe('GET', () => {
        it('should return 401 if not authorized', async () => {
            const req = new NextRequest('http://localhost/api/admin/pipeline/images?status=needs-images');
            const res = await GET(req);
            expect(res.status).toBe(401);
        });

        it('should return products needing image selection', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const mockProducts = [
                {
                    sku: 'SKU-001',
                    image_candidates: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
                    consolidated: { name: 'Product 1' },
                    pipeline_status: 'finalized',
                },
            ];

            mockSupabase.order.mockResolvedValue({ data: mockProducts, error: null });

            const req = new NextRequest('http://localhost/api/admin/pipeline/images?status=needs-images');
            const res = await GET(req);

            expect(res.status).toBe(200);
        });

        it('should handle database errors', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            mockSupabase.order.mockResolvedValue({ data: null, error: { message: 'DB error' } });

            const req = new NextRequest('http://localhost/api/admin/pipeline/images?status=needs-images');
            const res = await GET(req);

            expect(res.status).toBe(500);
        });
    });

    describe('POST', () => {
        it('should return 401 if not authorized', async () => {
            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: ['https://example.com/img1.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it('should return 400 if sku is missing', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const testReq = class extends NextRequest {
                async json() {
                    return { selectedImages: ['https://example.com/img1.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toContain('sku');
        });

        it('should return 400 if selectedImages is missing', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001' };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toContain('selectedImages');
        });

        it('should return 400 if selectedImages is not an array', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: 'not-an-array' };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(400);
        });

        it('should return 404 if product not found', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'NONEXISTENT', selectedImages: ['https://example.com/img1.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(404);
        });

        it('should return 400 if selected images are not from image_candidates', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const mockProduct = {
                sku: 'SKU-001',
                image_candidates: ['https://example.com/valid1.jpg', 'https://example.com/valid2.jpg'],
                consolidated: {},
            };

            mockSupabase.single.mockResolvedValue({ data: mockProduct, error: null });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: ['https://example.com/invalid.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toContain('Invalid image');
        });

        it('should accept selected images that are present in sources even when image_candidates is empty', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const sourceUrl = 'https://example.com/source-only.jpg';
            const mockProduct = {
                sku: 'SKU-001',
                image_candidates: [],
                selected_images: [],
                sources: {
                    chewy: {
                        image_url: sourceUrl,
                    },
                },
                consolidated: {},
            };

            const selectMock = {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
            };
            mockSupabase.select.mockReturnValue(selectMock);

            const updateEqMock = jest.fn().mockResolvedValue({ error: null });
            mockSupabase.update.mockReturnValue({ eq: updateEqMock });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: [sourceUrl] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
        });

        it('should successfully save selected images', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const mockProduct = {
                sku: 'SKU-001',
                image_candidates: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
                consolidated: { name: 'Product 1' },
            };

            const selectMock = {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
            };
            mockSupabase.select.mockReturnValue(selectMock);
            
            const updateEqMock = jest.fn().mockResolvedValue({ error: null });
            mockSupabase.update.mockReturnValue({ eq: updateEqMock });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: ['https://example.com/img1.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
        });

        it('should handle update errors', async () => {
            (requireAdminAuth as jest.Mock).mockResolvedValue({
                authorized: true,
                user: { id: 'user-123' },
                role: 'admin',
            });

            const mockProduct = {
                sku: 'SKU-001',
                image_candidates: ['https://example.com/img1.jpg'],
                consolidated: {},
            };

            const selectMock = {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
            };
            mockSupabase.select.mockReturnValue(selectMock);
            
            const updateEqMock = jest.fn().mockResolvedValue({ error: { message: 'Update failed' } });
            mockSupabase.update.mockReturnValue({ eq: updateEqMock });

            const testReq = class extends NextRequest {
                async json() {
                    return { sku: 'SKU-001', selectedImages: ['https://example.com/img1.jpg'] };
                }
            };
            const req = new (testReq as any)('http://localhost/api/admin/pipeline/images', {
                method: 'POST',
            });
            const res = await POST(req);

            expect(res.status).toBe(500);
        });
    });
});
