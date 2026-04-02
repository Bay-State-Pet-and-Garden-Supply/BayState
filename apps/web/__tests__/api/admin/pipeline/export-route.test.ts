import { TextDecoder, TextEncoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as never;

if (typeof ReadableStream === 'undefined') {
  const { ReadableStream } = require('stream/web');
  global.ReadableStream = ReadableStream;
}

jest.mock('next/server', () => ({
  NextRequest: class {
    nextUrl: URL;

    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  },
  NextResponse: class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;

    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }

    static json(body: unknown, init?: { status?: number }) {
      return new this(body, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    async json() {
      return this.body;
    }
  },
}));

jest.mock('exceljs', () => ({
  stream: {
    xlsx: {
      WorkbookWriter: jest.fn().mockImplementation(() => ({
        addWorksheet: jest.fn(() => ({
          columns: [],
          addRow: jest.fn(() => ({ commit: jest.fn() })),
          commit: jest.fn().mockResolvedValue(undefined),
        })),
        commit: jest.fn().mockResolvedValue(undefined),
      })),
    },
  },
}));

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { GET } = require('@/app/api/admin/pipeline/export/route');
const { NextRequest } = require('next/server');
const { createAdminClient } = require('@/lib/supabase/server');
const { requireAdminAuth } = require('@/lib/admin/api-auth');

function createSupabaseMock() {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    from: jest.fn(() => queryBuilder),
    queryBuilder,
  };
}

describe('pipeline export route compatibility boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      role: 'admin',
    });
  });

  it('maps legacy registered status to canonical imported exactly once at the route boundary', async () => {
    const { from, queryBuilder } = createSupabaseMock();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    (createAdminClient as jest.Mock).mockResolvedValue({ from });

    const response = await GET(
      new NextRequest('http://localhost/api/admin/pipeline/export?status=registered')
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(queryBuilder.select).toHaveBeenCalledWith(
      'sku, input, consolidated, selected_images, pipeline_status, updated_at'
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith('pipeline_status', 'imported');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("mapped legacy status 'registered' to canonical 'imported'")
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('rejects unknown statuses with canonical status help text', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/admin/pipeline/export?status=registered-again')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid status. Expected one of: imported, scraped, finalized, failed, all',
    });
  });
});
