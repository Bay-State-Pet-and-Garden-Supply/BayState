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

describe('/api/admin/pipeline/images', () => {
    let mockSupabase: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSupabase = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                       neq: jest.fn().mockReturnValue({
                            is: jest.fn().mockReturnValue({
                                order: jest.fn().mockResolvedValue({ data: [], error: null }),
                            }),
                        }),
                    }),
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        then: jest.fn().mockResolvedValue({ error: null }),
                    }),
                }),
            }),
        };

        mockCreateClient.mockResolvedValue(mockSupabase);
        mockRequireAdminAuth.mockResolvedValue({ 
            authorized: true, 
            user: { id: 'admin-1' },
            role: 'admin',
        });
    });

    describe('GET', () => {
        it('should return products needing image selection', async () => {
            const mockProducts = [
                {
                    sku: 'SKU001',
                    image_candidates: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
                    consolidated: { images: [] },
                },
                {
                    sku: 'SKU002',
                    image_candidates: ['https://example.com/img3.jpg'],
                    consolidated: {},
                },
            ];

            const mockSelect = jest.fn().mockReturnValue({
                not: jest.fn().mockReturnValue({
                    neq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            order: jest.fn().mockResolvedValue({ data: mockProducts, error: null }),
                        }),
                    }),
                }),
            });

            mockSupabase.from.mockReturnValue({
                select: mockSelect,
            });

            const { GET } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images');
            const response = await GET(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.products).toHaveLength(2);
        });

        it('should return 401 when not authorized', async () => {
            mockRequireAdminAuth.mockResolvedValue({ 
                authorized: false, 
                response: { status: 401, json: async () => ({ error: 'Unauthorized' }) } as any,
            });

            const { GET } = await import('@/app/api/admin/pipeline/images/route');
            
            const request = new (await import('next/server')).NextRequest('http://localhost:3000/api/admin/pipeline/images');
            const response = await GET(request);

            expect(response.status).toBe(401);
        });
    });

    describe('POST', () => {
        it('should save selected images successfully', async () => {
            const mockProduct = {
                sku: 'SKU001',
                image_candidates: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
                consolidated: { name: 'Test Product' },
            };

            const mockSelect = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
                }),
            });

            const mockUpdate = jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            });

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'products_ingestion') {
                    return { select: mockSelect, update: mockUpdate };
                }
                return {};
            });

            const { POST } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images', {
                method: 'POST',
                body: JSON.stringify({
                    sku: 'SKU001',
                    selectedImages: ['https://example.com/img1.jpg'],
                }),
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
        });

        it('should return 400 for invalid SKU', async () => {
            const mockSelect = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                }),
            });

            mockSupabase.from.mockReturnValue({
                select: mockSelect,
            });

            const { POST } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images', {
                method: 'POST',
                body: JSON.stringify({
                    sku: 'INVALID',
                    selectedImages: ['https://example.com/img1.jpg'],
                }),
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        it('should return 400 when image not in candidates', async () => {
            const mockProduct = {
                sku: 'SKU001',
                image_candidates: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
                consolidated: {},
            };

            const mockSelect = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockProduct, error: null }),
                }),
            });

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'products_ingestion') {
                    return { select: mockSelect };
                }
                return {};
            });

            const { POST } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images', {
                method: 'POST',
                body: JSON.stringify({
                    sku: 'SKU001',
                    selectedImages: ['https://example.com/invalid.jpg'],
                }),
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('not in image candidates');
        });

        it('should return 400 for missing required fields', async () => {
            const { POST } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images', {
                method: 'POST',
                body: JSON.stringify({ sku: 'SKU001' }),
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
        });

        it('should return 401 when not authorized', async () => {
            mockRequireAdminAuth.mockResolvedValue({ 
                authorized: false, 
                response: { status: 401, json: async () => ({ error: 'Unauthorized' }) } as any,
            });

            const { POST } = await import('@/app/api/admin/pipeline/images/route');
            
            const NextRequest = (await import('next/server')).NextRequest;
            const request = new NextRequest('http://localhost:3000/api/admin/pipeline/images', {
                method: 'POST',
                body: JSON.stringify({
                    sku: 'SKU001',
                    selectedImages: ['https://example.com/img1.jpg'],
                }),
            });

            const response = await POST(request);

            expect(response.status).toBe(401);
        });
    });
});
