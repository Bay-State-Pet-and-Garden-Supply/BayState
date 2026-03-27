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

      async json() {
        return {};
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
        return new (this as any)(body, {
          ...init,
          headers: { 'Content-Type': 'application/json' },
        });
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

jest.mock('@/lib/scraper-callback/image-retry-processor', () => ({
  resolveImageRetryTarget: jest.fn(),
}));

const { POST } = require('@/app/api/admin/scraping/retry-image/route');
const { NextRequest } = require('next/server');
const { createClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { resolveImageRetryTarget } = require('@/lib/scraper-callback/image-retry-processor');

describe('POST /api/admin/scraping/retry-image', () => {
  let mockSupabase: any;
  let selectQuery: any;
  let updateQuery: any;
  let imageRetryTable: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-user' },
      role: 'admin',
    });

    selectQuery = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    updateQuery = {
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    imageRetryTable = {
      select: jest.fn().mockReturnValue(selectQuery),
      update: jest.fn().mockReturnValue(updateQuery),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'image_retry_queue') {
          return imageRetryTable;
        }

        return {
          select: jest.fn().mockReturnValue(selectQuery),
        };
      }),
    };

    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    (resolveImageRetryTarget as jest.Mock).mockResolvedValue({
      productId: 'product-1',
      sku: 'SKU-404',
      sources: {},
      matchedSourceNames: ['protected'],
      scraper: { slug: 'protected', filePath: 'configs/protected.yaml', baseUrl: 'https://images.example.com', requiresLogin: true },
      requiresLogin: true,
    });
  });

  it('returns 401 when the user is not authorized', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 401 },
    });

    const req = new NextRequest('http://localhost/api/admin/scraping/retry-image');
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('returns 400 when product_id is missing', async () => {
    const RequestWithoutProductId = class extends NextRequest {
      async json() {
        return { image_url: 'https://images.example.com/broken.jpg' };
      }
    };

    const req = new (RequestWithoutProductId as any)(
      'http://localhost/api/admin/scraping/retry-image'
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('product_id') })
    );
  });

  it('skips non-login-protected sources', async () => {
    (resolveImageRetryTarget as jest.Mock).mockResolvedValue({
      productId: 'product-1',
      sku: 'SKU-404',
      sources: {},
      matchedSourceNames: ['public'],
      scraper: { slug: 'public', filePath: 'configs/public.yaml', baseUrl: 'https://images.example.com', requiresLogin: false },
      requiresLogin: false,
    });

    const RequestForPublicSource = class extends NextRequest {
      async json() {
        return {
          product_id: 'product-1',
          image_url: 'https://images.example.com/public.jpg',
        };
      }
    };

    const req = new (RequestForPublicSource as any)(
      'http://localhost/api/admin/scraping/retry-image'
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toEqual(
      expect.objectContaining({ accepted: true, queued: false })
    );
  });

  it('creates a pending retry entry when one does not already exist', async () => {
    const RequestWithBody = class extends NextRequest {
      async json() {
        return {
          product_id: 'product-1',
          image_url: 'https://images.example.com/broken.jpg',
        };
      }
    };

    const req = new (RequestWithBody as any)(
      'http://localhost/api/admin/scraping/retry-image'
    );
    const res = await POST(req);

    expect(res.status).toBe(202);
    expect(mockSupabase.from).toHaveBeenCalledWith('image_retry_queue');

    expect(imageRetryTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'product-1',
        image_url: 'https://images.example.com/broken.jpg',
        error_type: 'not_found_404',
        status: 'pending',
        retry_count: 0,
      })
    );
  });

  it('updates an existing retry entry instead of creating a duplicate', async () => {
    selectQuery.limit.mockResolvedValue({
      data: [
        {
          id: 'retry-1',
          product_id: 'product-1',
          image_url: 'https://images.example.com/broken.jpg',
        },
      ],
      error: null,
    });

    const RequestWithBody = class extends NextRequest {
      async json() {
        return {
          product_id: 'product-1',
          image_url: 'https://images.example.com/broken.jpg',
        };
      }
    };

    const req = new (RequestWithBody as any)(
      'http://localhost/api/admin/scraping/retry-image'
    );
    const res = await POST(req);

    expect(res.status).toBe(202);
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'retry-1');

    expect(imageRetryTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        error_type: 'not_found_404',
        status: 'pending',
        last_error: null,
      })
    );
    expect(imageRetryTable.insert).not.toHaveBeenCalled();
  });
});
