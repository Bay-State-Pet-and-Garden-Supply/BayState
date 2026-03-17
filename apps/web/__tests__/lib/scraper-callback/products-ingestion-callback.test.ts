import { SupabaseClient } from '@supabase/supabase-js';
import {
  MissingProductsIngestionSkusError,
  persistProductsIngestionSourcesStrict,
  persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';

function createSupabaseMock() {
  const selectIn = jest.fn();
  const select = jest.fn(() => ({ in: selectIn }));
  const upsert = jest.fn();
  const from = jest.fn(() => ({ select, upsert }));

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    select,
    selectIn,
    upsert,
  };
}

describe('persistProductsIngestionSourcesStrict', () => {
  it('updates all rows when every target SKU exists', async () => {
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
    expect(upsert).toHaveBeenCalledTimes(1);

    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'SKU-1' }),
        expect.objectContaining({ sku: 'SKU-2' }),
      ]),
      { onConflict: 'sku' }
    );
    expect((upsert.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>)[0][0][0]).toMatchObject(
      expect.objectContaining({
        pipeline_status: 'scraped',
        is_test_run: false,
        updated_at: nowIso,
      })
    );
    expect((upsert.mock.calls as unknown as Array<[Array<Record<string, unknown>>]>)[0][0][0]).toMatchObject({
      sources: {
        legacy: { price: 10 },
        amazon: { price: 12 },
        _last_scraped: nowIso,
      },
    });
  });

  it('deep-merges existing source payloads without dropping prior fields', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [
        { sku: 'SKU-1', sources: { amazon: { title: 'Existing title', upc: '12345' } } },
      ],
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
      expect.arrayContaining([
      expect.objectContaining({
        sources: {
          amazon: {
            title: 'Existing title',
            upc: '12345',
            price: 12,
          },
          _last_scraped: nowIso,
        },
      })
      ]),
      { onConflict: 'sku' }
    );
  });

  it('marks nested source payload as meaningful and sets scraped status', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [{ sku: 'SKU-1', sources: {} }],
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    await persistProductsIngestionSourcesStrict(
      supabase,
      {
        'SKU-1': { ai_discovery: { Name: 'Discovery Name' } },
      },
      false,
      nowIso
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
      expect.objectContaining({
        pipeline_status: 'scraped',
      })
      ]),
      { onConflict: 'sku' }
    );
  });

  it('strict-fails with zero writes when any target SKU is missing', async () => {
    const { selectIn, upsert, supabase } = createSupabaseMock();

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

    // Only the existing SKU should be updated
    expect(upsert).toHaveBeenCalledTimes(1);

    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
      expect.objectContaining({
        pipeline_status: 'scraped',
        is_test_run: false,
        updated_at: nowIso,
      })
      ]),
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

  it('persists all SKUs when none are missing', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [
        { sku: 'SKU-1', sources: {} },
        { sku: 'SKU-2', sources: {} },
      ],
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    const result = await persistProductsIngestionSourcesPartial(
      supabase,
      {
        'SKU-1': { amazon: { price: 12 } },
        'SKU-2': { chewy: { in_stock: true } },
      },
      false,
      nowIso
    );

    expect(result.persisted).toEqual(['SKU-1', 'SKU-2']);
    expect(result.missing).toEqual([]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('continues on individual update errors', async () => {
    const { supabase, selectIn, upsert } = createSupabaseMock();
    const nowIso = '2026-02-17T00:00:00.000Z';

    selectIn.mockResolvedValue({
      data: [
        { sku: 'SKU-1', sources: {} },
        { sku: 'SKU-2', sources: {} },
      ],
      error: null,
    });
    upsert
      .mockResolvedValueOnce({ error: { message: 'DB error' } })
      .mockResolvedValueOnce({ error: null });

    const result = await persistProductsIngestionSourcesPartial(
      supabase,
      {
        'SKU-1': { amazon: { price: 12 } },
        'SKU-2': { chewy: { in_stock: true } },
      },
      false,
      nowIso
    );

    expect(result.persisted).toEqual([]);
    expect(result.missing).toEqual(['SKU-1', 'SKU-2']);
  });
});
