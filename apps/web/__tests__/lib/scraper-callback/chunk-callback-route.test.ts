if (typeof (globalThis as any).Request === 'undefined') {
  class Request { }
  (globalThis as any).Request = Request;
}

if (typeof (globalThis as any).Response === 'undefined') {
  class Response { }
  (globalThis as any).Response = Response;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { persistProductsIngestionSourcesPartial } from '@/lib/scraper-callback/products-ingestion';

type PersistChunkResultsToPipelineFn =
  typeof import('@/app/api/scraper/v1/chunk-callback/route').persistChunkResultsToPipeline;
type MergeChunkResultsFn =
  typeof import('@/app/api/scraper/v1/chunk-callback/route').mergeChunkResults;

jest.mock('@/lib/scraper-callback/products-ingestion', () => ({
  persistProductsIngestionSourcesPartial: jest.fn(),
}));

const mockedPersist = persistProductsIngestionSourcesPartial as jest.MockedFunction<
  typeof persistProductsIngestionSourcesPartial
>;

let persistChunkResultsToPipeline: PersistChunkResultsToPipelineFn;
let mergeChunkResults: MergeChunkResultsFn;

describe('persistChunkResultsToPipeline', () => {
  const supabase = {} as SupabaseClient;
  const aggregatedResults = {
    'SKU-1': { amazon: { price: 10 } },
  };

  beforeAll(async () => {
    const routeModule = await import('@/app/api/scraper/v1/chunk-callback/route');
    persistChunkResultsToPipeline = routeModule.persistChunkResultsToPipeline;
    mergeChunkResults = routeModule.mergeChunkResults;
  });

  beforeEach(() => {
    mockedPersist.mockReset();
  });

  it('skips products_ingestion writes for test jobs', async () => {
    const result = await persistChunkResultsToPipeline(supabase, 'job-test', aggregatedResults, true);

    expect(result).toEqual([]);
    expect(mockedPersist).not.toHaveBeenCalled();
  });

  it('persists aggregated results for production jobs using partial persistence', async () => {
    mockedPersist.mockResolvedValue({ persisted: ['SKU-1'], missing: [] });

    const result = await persistChunkResultsToPipeline(supabase, 'job-prod', aggregatedResults, false);

    expect(mockedPersist).toHaveBeenCalledTimes(1);
    expect(mockedPersist).toHaveBeenCalledWith(supabase, aggregatedResults, false, expect.any(String));
    expect(result).toEqual(['SKU-1']);
  });

  it('returns only persisted SKUs when some are missing', async () => {
    mockedPersist.mockResolvedValue({ persisted: ['SKU-1'], missing: ['SKU-MISSING'] });

    const mixedResults = {
      'SKU-1': { amazon: { price: 10 } },
      'SKU-MISSING': { chewy: { in_stock: true } },
    };

    const result = await persistChunkResultsToPipeline(supabase, 'job-partial', mixedResults, false);

    expect(result).toEqual(['SKU-1']);
    // Should NOT throw — partial persistence handles missing SKUs gracefully
  });

  it('merges chunk results by source and preserves multiple scrapers', () => {
    const merged = mergeChunkResults([
      {
        results: {
          'SKU-1': {
            amazon: { Name: 'Product A', Price: '$10.00' },
          },
        },
      },
      {
        results: {
          'SKU-1': {
            ai_discovery: { Brand: 'KONG', Description: 'Discovery text' },
          },
        },
      },
      {
        results: {
          'SKU-1': {
            amazon: { Color: 'Red' },
          },
        },
      },
    ]);

    expect(merged['SKU-1']).toEqual({
      amazon: {
        Name: 'Product A',
        Price: '$10.00',
        Color: 'Red',
      },
      ai_discovery: {
        Brand: 'KONG',
        Description: 'Discovery text',
      },
    });
  });
});
