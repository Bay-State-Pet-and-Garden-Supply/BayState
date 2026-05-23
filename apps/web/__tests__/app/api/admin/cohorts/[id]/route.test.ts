export {};
const {
  NextRequest,
  createClient,
  createAdminClient,
  requireAdminAuth,
} = require('@/__tests__/helpers/admin-api-route-harness');
const { GET, PATCH } = require('@/app/api/admin/cohorts/[id]/route');

function createPatchSupabaseMock(options?: {
  currentCohort?: { upc_prefix: string | null; name: string | null };
  brand?: { name: string } | null;
  updated?: Record<string, unknown>;
}) {
  const currentCohortSingle = jest.fn().mockResolvedValue({
    data: options?.currentCohort ?? { upc_prefix: '12345', name: '12345' },
    error: null,
  });
  const brandSingle = jest.fn().mockResolvedValue({
    data: options?.brand ?? null,
    error: null,
  });
  const updateSingle = jest.fn().mockResolvedValue({
    data:
      options?.updated ?? {
        id: 'cohort-1',
        brand_id: null,
        brand_name: null,
        name: '12345',
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

  return {
    supabase: {
      from: jest.fn((table: string) => {
        if (table === 'cohort_batches') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: currentCohortSingle,
              }),
            }),
            update,
          };
        }

        if (table === 'brands') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: brandSingle,
              }),
            }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
    update,
    currentCohortSingle,
    brandSingle,
  };
}

describe('/api/admin/cohorts/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
    (createAdminClient as jest.Mock).mockImplementation(async () => createClient());
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
      official_domains: ['acme.example'],
      preferred_domains: ['retailer.example'],
    });
  });

  it('normalizes selected brands to brand_id, clears brand_name, and auto-names from the cohort prefix', async () => {
    const { supabase, update, brandSingle } = createPatchSupabaseMock({
      brand: { name: 'Acme' },
      updated: {
        id: 'cohort-1',
        brand_id: 'brand-1',
        brand_name: null,
        name: 'Acme 12345',
        brands: {
          id: 'brand-1',
          name: 'Acme',
          slug: 'acme',
          logo_url: null,
          official_domains: [],
          preferred_domains: [],
        },
      },
    });

    (createClient as jest.Mock).mockResolvedValue(supabase);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1', {
        body: JSON.stringify({ brand_id: 'brand-1', brand_name: 'Legacy Name' }),
      }),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );
    const payload = await response.json();

    expect(brandSingle).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      brand_id: 'brand-1',
      brand_name: null,
      name: 'Acme 12345',
    });
    expect(payload.cohort.brand_id).toBe('brand-1');
    expect(payload.cohort.brand_name).toBeNull();
    expect(payload.cohort.name).toBe('Acme 12345');
  });

  it('normalizes freeform brand_name input and clears brand_id', async () => {
    const { supabase, update, brandSingle } = createPatchSupabaseMock({
      updated: {
        id: 'cohort-1',
        brand_id: null,
        brand_name: 'Custom Brand',
        name: 'Custom Brand 12345',
        brands: null,
      },
    });

    (createClient as jest.Mock).mockResolvedValue(supabase);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1', {
        body: JSON.stringify({ brand_id: '   ', brand_name: 'Custom Brand' }),
      }),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );
    const payload = await response.json();

    expect(brandSingle).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      brand_id: null,
      brand_name: 'Custom Brand',
      name: 'Custom Brand 12345',
    });
    expect(payload.cohort.brand_id).toBeNull();
    expect(payload.cohort.brand_name).toBe('Custom Brand');
  });

  it('upgrades explicit UPC-only names to include the selected brand automatically', async () => {
    const { supabase, update } = createPatchSupabaseMock({
      brand: { name: 'Acme' },
      updated: {
        id: 'cohort-1',
        brand_id: 'brand-1',
        brand_name: null,
        name: 'Acme 12345',
        brands: {
          id: 'brand-1',
          name: 'Acme',
          slug: 'acme',
          logo_url: null,
          official_domains: [],
          preferred_domains: [],
        },
      },
    });

    (createClient as jest.Mock).mockResolvedValue(supabase);

    await PATCH(
      new NextRequest('http://localhost/api/admin/cohorts/cohort-1', {
        body: JSON.stringify({ brand_id: 'brand-1', name: '12345' }),
      }),
      { params: Promise.resolve({ id: 'cohort-1' }) }
    );

    expect(update).toHaveBeenCalledWith({
      brand_id: 'brand-1',
      brand_name: null,
      name: 'Acme 12345',
    });
  });

  it('clears both brand_id and brand_name when assignment is removed', async () => {
    const { supabase, update } = createPatchSupabaseMock({
      updated: {
        id: 'cohort-1',
        brand_id: null,
        brand_name: null,
        name: '12345',
        brands: null,
      },
    });

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
