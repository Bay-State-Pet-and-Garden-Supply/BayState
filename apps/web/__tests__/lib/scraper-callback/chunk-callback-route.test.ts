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
type MergeChunkPayloadResultsFn =
  typeof import('@/app/api/scraper/v1/chunk-callback/route').mergeChunkPayloadResults;
type BuildProgressResultsFn =
  typeof import('@/app/api/scraper/v1/chunk-callback/route').buildProgressResults;

jest.mock('@/lib/scraper-callback/products-ingestion', () => ({
  persistProductsIngestionSourcesPartial: jest.fn(),
}));

const mockedPersist = persistProductsIngestionSourcesPartial as jest.MockedFunction<
  typeof persistProductsIngestionSourcesPartial
>;

let persistChunkResultsToPipeline: PersistChunkResultsToPipelineFn;
let mergeChunkResults: MergeChunkResultsFn;
let mergeChunkPayloadResults: MergeChunkPayloadResultsFn;
let buildProgressResults: BuildProgressResultsFn;

describe('persistChunkResultsToPipeline', () => {
  const supabase = {} as SupabaseClient;
  const aggregatedResults = {
    'SKU-1': { amazon: { price: 10 } },
  };

  beforeAll(async () => {
    const routeModule = await import('@/app/api/scraper/v1/chunk-callback/route');
    persistChunkResultsToPipeline = routeModule.persistChunkResultsToPipeline;
    mergeChunkResults = routeModule.mergeChunkResults;
    mergeChunkPayloadResults = routeModule.mergeChunkPayloadResults;
    buildProgressResults = routeModule.buildProgressResults;
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

  it('ignores ai_search diagnostic-only payloads when merging chunk results', () => {
    const merged = mergeChunkResults([
      {
        results: {
          'SKU-1': {
            ai_search: {
              error: 'BRAVE_API_KEY not set',
              cost_usd: 0,
              scraped_at: '2026-03-11T23:24:53.854779',
            },
          },
        },
      },
      {
        results: {
          'SKU-2': {
            ai_search: {
              title: 'Valid AI Result',
              price: 21.99,
            },
          },
        },
      },
    ]);

    expect(merged['SKU-1']).toBeUndefined();
    expect(merged['SKU-2']).toEqual({
      ai_search: {
        title: 'Valid AI Result',
        price: 21.99,
      },
    });
  });

  it('keeps valid sources while removing diagnostic-only ai_search on same SKU', () => {
    const merged = mergeChunkResults([
      {
        results: {
          'SKU-3': {
            amazon: {
              name: 'Gas Can 2 Gal',
              price: 21.99,
            },
            ai_search: {
              error: 'BRAVE_API_KEY not set',
              cost_usd: 0,
              scraped_at: '2026-03-11T23:24:53.854779',
            },
          },
        },
      },
    ]);

    expect(merged['SKU-3']).toEqual({
      amazon: {
        name: 'Gas Can 2 Gal',
        price: 21.99,
      },
    });
  });

  it('builds progress payloads in the chunk-results shape expected by persistence', () => {
    const progressResults = buildProgressResults({
      sku: 'SKU-4',
      scraper_name: 'amazon',
      data: {
        Name: 'Progress Product',
        Price: '$15.99',
      },
    });

    expect(progressResults).toEqual({
      'SKU-4': {
        amazon: {
          Name: 'Progress Product',
          Price: '$15.99',
        },
      },
    });
  });

  it('merges existing chunk results with new progress without dropping prior sources', () => {
    const merged = mergeChunkPayloadResults(
      {
        'SKU-5': {
          amazon: {
            Name: 'Existing Product',
          },
        },
      },
      {
        'SKU-5': {
          chewy: {
            Description: 'New source payload',
          },
        },
      }
    );

    expect(merged).toEqual({
      'SKU-5': {
        amazon: {
          Name: 'Existing Product',
        },
        chewy: {
          Description: 'New source payload',
        },
      },
    });
  });
});
