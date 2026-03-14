import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MissingProductsIngestionSkusError,
  persistProductsIngestionSourcesPartial,
  persistProductsIngestionSourcesStrict,
} from '@/lib/scraper-callback/products-ingestion';

function createSupabaseMock() {
  const selectIn = jest.fn();
  const select = jest.fn(() => ({ in: selectIn }));
  const upsert = jest.fn();
  const from = jest.fn((table: string) => {
    if (table !== 'products_ingestion') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select,
      upsert,
    };
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    select,
    selectIn,
    upsert,
  };
}

describe('persistProductsIngestionSourcesStrict', () => {
  it('upserts merged sources and marks meaningful rows as enriched', async () => {
    const { supabase, from, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [
        { sku: 'SKU-1', sources: { legacy: { price: 10 } } },
        { sku: 'SKU-2', sources: {} },
      ],
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    const result = await persistProductsIngestionSourcesStrict(
      supabase,
      {
        'SKU-1': { amazon: { price: 12 } },
        'SKU-2': { chewy: { in_stock: true } },
      },
      false,
      nowIso
    );

    expect(result).toEqual(['SKU-1', 'SKU-2']);
    expect(from).toHaveBeenCalledWith('products_ingestion');
    expect(selectIn).toHaveBeenCalledWith('sku', ['SKU-1', 'SKU-2']);
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sku: 'SKU-1',
          is_test_run: false,
          updated_at: nowIso,
          pipeline_status: 'enriched',
          sources: {
            legacy: { price: 10 },
            amazon: { price: 12 },
            _last_scraped: nowIso,
          },
          image_candidates: [],
        }),
        expect.objectContaining({
          sku: 'SKU-2',
          pipeline_status: 'enriched',
          sources: {
            chewy: { in_stock: true },
            _last_scraped: nowIso,
          },
          image_candidates: [],
        }),
      ]),
      { onConflict: 'sku' }
    );
  });

  it('deep-merges source payloads without dropping existing fields', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [{ sku: 'SKU-1', sources: { amazon: { title: 'Existing title', upc: '12345' } } }],
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    await persistProductsIngestionSourcesStrict(
      supabase,
      {
        'SKU-1': { amazon: { price: 12 } },
      },
      false,
      nowIso
    );

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sku: 'SKU-1',
          sources: {
            amazon: {
              title: 'Existing title',
              upc: '12345',
              price: 12,
            },
            _last_scraped: nowIso,
          },
        }),
      ],
      { onConflict: 'sku' }
    );
  });

  it('fails without writing when any SKU is missing', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();

    selectIn.mockResolvedValue({
      data: [{ sku: 'SKU-1', sources: { legacy: { price: 10 } } }],
      error: null,
    });

    await expect(
      persistProductsIngestionSourcesStrict(
        supabase,
        {
          'SKU-1': { amazon: { price: 12 } },
          'SKU-MISSING': { chewy: { in_stock: true } },
        },
        false,
        '2026-02-17T00:00:00.000Z'
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<MissingProductsIngestionSkusError>>({
        name: 'MissingProductsIngestionSkusError',
        missingSkus: ['SKU-MISSING'],
      })
    );

    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('persistProductsIngestionSourcesPartial', () => {
  it('persists existing SKUs and reports missing ones', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [{ sku: 'SKU-1', sources: { legacy: { price: 10 } } }],
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    const result = await persistProductsIngestionSourcesPartial(
      supabase,
      {
        'SKU-1': { amazon: { price: 12 } },
        'SKU-MISSING': { chewy: { in_stock: true } },
      },
      false,
      nowIso
    );

    expect(result.persisted).toEqual(['SKU-1']);
    expect(result.missing).toEqual(['SKU-MISSING']);
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sku: 'SKU-1',
          pipeline_status: 'enriched',
          sources: {
            legacy: { price: 10 },
            amazon: { price: 12 },
            _last_scraped: nowIso,
          },
          image_candidates: [],
        }),
      ],
      { onConflict: 'sku' }
    );
  });

  it('returns empty persisted when no SKUs exist', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();

    selectIn.mockResolvedValue({ data: [], error: null });

    const result = await persistProductsIngestionSourcesPartial(
      supabase,
      {
        'MISSING-1': { amazon: { price: 12 } },
        'MISSING-2': { chewy: { in_stock: true } },
      },
      false,
      '2026-02-17T00:00:00.000Z'
    );

    expect(result.persisted).toEqual([]);
    expect(result.missing).toEqual(['MISSING-1', 'MISSING-2']);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('throws when the bulk upsert fails so the caller can retry safely', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();

    selectIn.mockResolvedValue({
      data: [{ sku: 'SKU-1', sources: {} }],
      error: null,
    });
    upsert.mockResolvedValue({ error: { message: 'DB error' } });

    await expect(
      persistProductsIngestionSourcesPartial(
        supabase,
        {
          'SKU-1': { amazon: { price: 12 } },
        },
        false,
        '2026-02-17T00:00:00.000Z'
      )
    ).rejects.toThrow('Bulk update failed: DB error');
  });
});
