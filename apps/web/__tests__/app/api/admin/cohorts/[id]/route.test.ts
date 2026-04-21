jest.mock('next/server', () => ({
  NextRequest: class {
    nextUrl: URL;
    private readonly requestBody: unknown;

    constructor(url: string, init?: { body?: unknown }) {
      this.nextUrl = new URL(url);
      this.requestBody = init?.body;
    }

    async json() {
      if (typeof this.requestBody === 'string') {
        return JSON.parse(this.requestBody);
      }

      return this.requestBody;
    }
  },
  NextResponse: class {
    body: unknown;
    status: number;

    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }

    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init);
    }

    async json() {
      return this.body;
    }
  },
}));

import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/admin/cohorts/[id]/route';

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createClient } = require('@/lib/supabase/server');

describe('/api/admin/cohorts/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
  });

  it('returns cohort detail with expanded brand readiness fields', async () => {
    const cohortSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'cohort-1',
        brand_id: 'brand-1',
        brand_name: null,
        brands: {
          id: 'brand-1',
          name: 'Acme',
          slug: 'acme',
          logo_url: null,
          website_url: 'https://acme.example',
          official_domains: ['acme.example'],
          preferred_domains: ['retailer.example'],
        },
      },
      error: null,
    });
    const memberOrder = jest.fn().mockResolvedValue({ data: [], error: null });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'cohort_batches') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: cohortSingle,
              }),
            }),
          };
        }

        if (table === 'cohort_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: memberOrder,
              }),
            }),
          };
        }

        if (table === 'products_ingestion') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    (createClient as jest.Mock).mockResolvedValue(supabase);

    const response = await GET(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1?include_members=true'),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );
    const payload = await response.json();

    expect(payload.cohort.brands).toEqual({
      id: 'brand-1',
      name: 'Acme',
      slug: 'acme',
      logo_url: null,
      website_url: 'https://acme.example',
      official_domains: ['acme.example'],
      preferred_domains: ['retailer.example'],
    });
  });

  it('normalizes selected brands to brand_id and clears brand_name', async () => {
    const updateSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'cohort-1',
        brand_id: 'brand-1',
        brand_name: null,
        brands: {
          id: 'brand-1',
          name: 'Acme',
          slug: 'acme',
          logo_url: null,
          website_url: null,
          official_domains: [],
          preferred_domains: [],
        },
      },
      error: null,
    });
    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: updateSingle,
        }),
      }),
    });

    const supabase = {
      from: jest.fn(() => ({ update })),
    };

    (createClient as jest.Mock).mockResolvedValue(supabase);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1', {
        body: JSON.stringify({ brand_id: 'brand-1', brand_name: 'Legacy Name' }),
      }),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );
    const payload = await response.json();

    expect(update).toHaveBeenCalledWith({
      brand_id: 'brand-1',
      brand_name: null,
    });
    expect(payload.cohort.brand_id).toBe('brand-1');
    expect(payload.cohort.brand_name).toBeNull();
  });

  it('clears both brand_id and brand_name when assignment is removed', async () => {
    const updateSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'cohort-1',
        brand_id: null,
        brand_name: null,
        brands: null,
      },
      error: null,
    });
    const update = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: updateSingle,
        }),
      }),
    });

    const supabase = {
      from: jest.fn(() => ({ update })),
    };

    (createClient as jest.Mock).mockResolvedValue(supabase);

    await PATCH(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1', {
        body: JSON.stringify({ brand_id: null, brand_name: null }),
      }),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );

    expect(update).toHaveBeenCalledWith({
      brand_id: null,
      brand_name: null,
    });
  });
});
