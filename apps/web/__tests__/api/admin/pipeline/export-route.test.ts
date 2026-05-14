import { PERSISTED_PIPELINE_STATUSES } from '@/lib/pipeline/types';

const {
  NextRequest,
  createAdminClient,
  requireAdminAuth,
} = require('@/__tests__/helpers/admin-api-route-harness');

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

const { GET, POST } = require('@/app/api/admin/pipeline/export/route');

function createSupabaseMock() {
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    from: jest.fn(() => queryBuilder),
    queryBuilder,
  };
}

const CANONICAL_EXPORT_STATUS_MESSAGE = `Invalid status. Expected one of: ${[
  ...PERSISTED_PIPELINE_STATUSES,
  'all',
].join(', ')}`;

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
    expect(queryBuilder.is).toHaveBeenCalledWith('exported_at', null);
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
      error: CANONICAL_EXPORT_STATUS_MESSAGE,
    });
  });

  it('exports a selected SKU subset from the exporting queue via POST', async () => {
    const { from, queryBuilder } = createSupabaseMock();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    (createAdminClient as jest.Mock).mockResolvedValue({ from });

    const response = await POST({
      json: async () => ({ skus: ['SKU-1', 'SKU-2'] }),
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(queryBuilder.eq).toHaveBeenCalledWith('pipeline_status', 'publishing');
    expect(queryBuilder.is).toHaveBeenCalledWith('exported_at', null);
    expect(queryBuilder.in).toHaveBeenCalledWith('sku', ['SKU-1', 'SKU-2']);

    errorSpy.mockRestore();
  });
});
