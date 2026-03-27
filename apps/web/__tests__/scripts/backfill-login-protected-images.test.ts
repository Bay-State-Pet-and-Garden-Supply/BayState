/**
 * @jest-environment node
 */

import {
  collectLoginProtectedImageBackfillCandidates,
  executeLoginProtectedImageBackfillWithClient,
  resolveLoginProtectedScraperSlugs,
} from '../../scripts/backfill-login-protected-images-logic';

describe('backfill-login-protected-images logic', () => {
  it('resolves login-protected scrapers from config', () => {
    const result = resolveLoginProtectedScraperSlugs([
      {
        slug: 'phillips',
        base_url: 'https://phillips.example.com',
        schema_version: '1.0' as never,
        login: {
          login_url: 'https://phillips.example.com/login',
        },
      },
      {
        slug: 'orgill',
        base_url: 'https://orgill.example.com',
        schema_version: '1.0' as never,
        workflows: [
          {
            action: 'login',
            params: {
              username_selector: '#username',
            },
          } as never,
        ],
      },
      {
        slug: 'public-site',
        base_url: 'https://public.example.com',
        schema_version: '1.0' as never,
      },
    ]);

    expect(result).toEqual(['phillips', 'orgill']);
  });

  it('collects non-durable images for login-protected sources only', async () => {
    const candidates = await collectLoginProtectedImageBackfillCandidates(
      [
        {
          id: 'product-1',
          sku: 'SKU-1',
          sources: {
            phillips: {
              images: [
                'https://private.example.com/one.jpg',
                'https://fapnuczapcatelxxmrail.supabase.co/storage/v1/object/public/product-images/catalog/durable.jpg',
              ],
              gallery: [{ thumbnail: 'https://private.example.com/one.jpg' }],
            },
            amazon: {
              images: ['https://cdn.example.com/public.jpg'],
            },
          },
        },
      ] as never,
      ['phillips'],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      productId: 'SKU-1',
      sku: 'SKU-1',
      targets: [
        {
          sourceName: 'phillips',
          imageUrl: 'https://private.example.com/one.jpg',
          normalizedUrl: 'https://private.example.com/one.jpg',
        },
      ],
    });
  });

  it('batches 100 at a time in dry-run and reports counts without inserts', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      id: `product-${index + 1}`,
      sku: `SKU-${index + 1}`,
      sources: {
        phillips: {
          requires_login: true,
          images: [`https://private.example.com/${index + 1}.jpg`],
        },
      },
    }));

    const productsRanges: Array<{ from: number; to: number }> = [];
    const queueSelectCalls: string[] = [];
    const insertCalls: unknown[] = [];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'products_ingestion') {
          return {
            select: (_columns: string) => ({
              order: (_orderColumn: string, _orderOptions: unknown) => ({
                range: async (from: number, to: number) => {
                  productsRanges.push({ from, to });
                  const sliced = rows.slice(from, to + 1);
                  return { data: sliced, error: null };
                },
              }),
            }),
          };
        }

        if (table === 'image_retry_queue') {
          return {
            select: (_columns: string) => ({
              eq: (_column: string, productId: string) => ({
                in: async (_inColumn: string, _urls: string[]) => {
                  queueSelectCalls.push(productId);
                  return { data: [], error: null };
                },
              }),
            }),
            insert: async (payload: unknown) => {
              insertCalls.push(payload);
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await executeLoginProtectedImageBackfillWithClient(
      mockSupabase as never,
      ['phillips'],
      {
        mode: 'dry-run',
        batchSize: 100,
      },
    );

    expect(productsRanges).toEqual([
      { from: 0, to: 99 },
      { from: 100, to: 199 },
      { from: 200, to: 299 },
    ]);
    expect(queueSelectCalls).toHaveLength(250);
    expect(insertCalls).toHaveLength(0);

    expect(result).toEqual({
      mode: 'dry-run',
      scannedCount: 250,
      totalFound: 250,
      alreadyQueued: 0,
      newlyQueued: 250,
      errors: 0,
      batchesProcessed: 3,
      batchSize: 100,
      productsWithTargets: 250,
    });
  });

  it('avoids duplicates and inserts only new queue entries in execute mode', async () => {
    const insertCalls: Array<Record<string, unknown>> = [];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'products_ingestion') {
          return {
            select: (_columns: string) => ({
              order: (_orderColumn: string, _orderOptions: unknown) => ({
                range: async (from: number, _to: number) => {
                  if (from > 0) {
                    return { data: [], error: null };
                  }

                  return {
                    data: [
                      {
                        sku: 'SKU-1',
                        sources: {
                          phillips: {
                            requires_login: true,
                            images: [
                              'https://private.example.com/already-queued.jpg',
                              'https://private.example.com/new-entry.jpg',
                            ],
                          },
                        },
                      },
                    ],
                    error: null,
                  };
                },
              }),
            }),
          };
        }

        if (table === 'image_retry_queue') {
          return {
            select: (_columns: string) => ({
              eq: (_column: string, _productId: string) => ({
                in: async (_inColumn: string, _urls: string[]) => ({
                  data: [{ image_url: 'https://private.example.com/already-queued.jpg' }],
                  error: null,
                }),
              }),
            }),
            insert: async (payload: Record<string, unknown>) => {
              insertCalls.push(payload);
              if ('priority' in payload) {
                return {
                  error: {
                    message: 'column "priority" of relation "image_retry_queue" does not exist',
                  },
                };
              }

              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await executeLoginProtectedImageBackfillWithClient(
      mockSupabase as never,
      ['phillips'],
      {
        mode: 'execute',
        batchSize: 100,
      },
    );

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]).toEqual(
      expect.objectContaining({
        sku: 'SKU-1',
        image_url: 'https://private.example.com/new-entry.jpg',
        priority: 'backfill',
      }),
    );
    expect(insertCalls[1]).toEqual(
      expect.objectContaining({
        sku: 'SKU-1',
        image_url: 'https://private.example.com/new-entry.jpg',
        status: 'pending',
        error_type: 'not_found_404',
      }),
    );

    expect(result).toEqual({
      mode: 'execute',
      scannedCount: 1,
      totalFound: 2,
      alreadyQueued: 1,
      newlyQueued: 1,
      errors: 0,
      batchesProcessed: 1,
      batchSize: 100,
      productsWithTargets: 1,
    });
  });
});
