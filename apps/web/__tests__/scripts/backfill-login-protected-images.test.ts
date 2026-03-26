/**
 * @jest-environment node
 */

import {
  collectLoginProtectedImageBackfillCandidates,
  executeLoginProtectedImageBackfillWithClient,
  resolveLoginProtectedScraperSlugs,
} from '../../scripts/backfill-login-protected-images-logic';

describe('backfill-login-protected-images logic', () => {
  it('only treats scrapers with real login flows as login-protected', () => {
    const result = resolveLoginProtectedScraperSlugs([
      {
        slug: 'phillips',
        base_url: 'https://phillips.example.com',
        schema_version: '1.0' as any,
        login: {
          login_url: 'https://phillips.example.com/login',
        },
      },
      {
        slug: 'orgill',
        base_url: 'https://orgill.example.com',
        schema_version: '1.0' as any,
        workflows: [
          {
            action: 'login',
            params: {
              username_selector: '#username',
            },
          } as any,
        ],
      },
      {
        slug: 'central-pet',
        base_url: 'https://central.example.com',
        schema_version: '1.0' as any,
        credential_refs: ['username', 'password'],
        login: null as any,
      },
    ]);

    expect(result).toEqual(['phillips', 'orgill']);
  });

  it('plans source cleanup and image pruning for affected login-protected sources', () => {
    const [candidate] = collectLoginProtectedImageBackfillCandidates(
      [
        {
          sku: 'SKU-1',
          pipeline_status: 'published',
          input: {
            name: 'Protected Product',
          },
          sources: {
            phillips: {
              title: 'Protected Product',
              images: [
                'https://private.example.com/hero.jpg',
                'https://fapnuczapcatelxxmrail.supabase.co/storage/v1/object/public/product-images/catalog/durable.jpg',
              ],
              gallery: [{ thumbnail: 'https://private.example.com/thumb.png' }],
              price: '12.99',
              scraped_at: '2026-03-22T00:00:00.000Z',
            },
            amazon: {
              images: ['https://cdn.example.com/public.jpg'],
            },
            _last_scraped: '2026-03-22T00:00:00.000Z',
          },
          image_candidates: [
            'https://private.example.com/hero.jpg',
            'https://cdn.example.com/public.jpg',
          ],
          selected_images: [
            { url: 'https://private.example.com/hero.jpg', selectedAt: '2026-03-22T00:00:00.000Z' },
            { url: 'https://cdn.example.com/public.jpg', selectedAt: '2026-03-22T00:00:00.000Z' },
          ],
          consolidated: {
            name: 'Protected Product',
            images: [
              'https://private.example.com/hero.jpg',
              'https://cdn.example.com/public.jpg',
            ],
          },
        },
      ] as any,
      ['phillips'],
    );

    expect(candidate.affectedSources).toEqual(['phillips']);
    expect(candidate.requiresRepublish).toBe(true);
    expect(candidate.staleSourceImages).toEqual([
      'https://private.example.com/hero.jpg',
      'https://private.example.com/thumb.png',
    ]);
    expect(candidate.staleSelectedImages).toEqual(['https://private.example.com/hero.jpg']);
    expect(candidate.staleConsolidatedImages).toEqual(['https://private.example.com/hero.jpg']);
    expect(candidate.staleImageCandidates).toEqual(['https://private.example.com/hero.jpg']);
    expect(candidate.updatedSources).toEqual({
      phillips: {
        title: 'Protected Product',
        price: '12.99',
        scraped_at: '2026-03-22T00:00:00.000Z',
      },
      amazon: {
        images: ['https://cdn.example.com/public.jpg'],
      },
      _last_scraped: '2026-03-22T00:00:00.000Z',
    });
    expect(candidate.updatedSelectedImages).toEqual([
      { url: 'https://cdn.example.com/public.jpg', selectedAt: '2026-03-22T00:00:00.000Z' },
    ]);
    expect(candidate.updatedImageCandidates).toEqual(['https://cdn.example.com/public.jpg']);
    expect(candidate.updatedConsolidated).toEqual({
      name: 'Protected Product',
      images: ['https://cdn.example.com/public.jpg'],
    });
  });

  it('updates affected rows and queues grouped replacement scrape jobs during execute mode', async () => {
    const updates: Array<{ sku: string; values: Record<string, unknown> }> = [];
    const jobPayloads: Array<Record<string, unknown>> = [];
    const chunkPayloads: Array<Record<string, unknown>> = [];
    const auditPayloads: Array<Record<string, unknown>> = [];
    let jobCounter = 0;

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'products_ingestion') {
          return {
            update: (values: Record<string, unknown>) => ({
              eq: async (_column: string, sku: string) => {
                updates.push({ sku, values });
                return { error: null };
              },
            }),
            select: (columns: string) => {
              if (columns !== 'sku, input') {
                throw new Error(`Unexpected select on products_ingestion: ${columns}`);
              }

              return {
                in: async (_column: string, skus: string[]) => ({
                  data: skus.map((sku) => ({
                    sku,
                    input: {
                      name: `${sku} Product`,
                      brand: 'Bay State',
                    },
                  })),
                  error: null,
                }),
              };
            },
          };
        }

        if (table === 'pipeline_audit_log') {
          return {
            insert: async (rows: Record<string, unknown>[]) => {
              auditPayloads.push(...rows);
              return { error: null };
            },
          };
        }

        if (table === 'scrape_jobs') {
          return {
            insert: (values: Record<string, unknown>) => ({
              select: (_columns: string) => ({
                single: async () => {
                  jobPayloads.push(values);
                  jobCounter += 1;
                  return {
                    data: { id: `job-${jobCounter}` },
                    error: null,
                  };
                },
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === 'scrape_job_chunks') {
          return {
            insert: async (rows: Record<string, unknown>[]) => {
              chunkPayloads.push(...rows);
              return { error: null };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await executeLoginProtectedImageBackfillWithClient(
      mockSupabase as any,
      [
        {
          sku: 'SKU-1',
          pipeline_status: 'images_selected',
          input: {
            name: 'SKU-1 Product',
          },
          sources: {
            phillips: {
              images: ['https://private.example.com/one.jpg'],
            },
          },
          image_candidates: ['https://private.example.com/one.jpg'],
          selected_images: [{ url: 'https://private.example.com/one.jpg' }],
          consolidated: {
            images: ['https://private.example.com/one.jpg'],
          },
        },
        {
          sku: 'SKU-2',
          pipeline_status: 'scraped',
          input: {
            name: 'SKU-2 Product',
          },
          sources: {
            phillips: {
              gallery: [{ thumbnail: 'https://private.example.com/two.jpg' }],
            },
          },
          image_candidates: ['https://private.example.com/two.jpg'],
          selected_images: [],
          consolidated: {
            images: ['https://private.example.com/two.jpg'],
          },
        },
      ] as any,
      ['phillips'],
      {
        mode: 'execute',
        maxWorkers: 4,
        chunkSize: 25,
      },
    );

    expect(result.updatedCount).toBe(2);
    expect(result.queuedJobIds).toEqual(['job-1']);
    expect(updates).toHaveLength(2);
    expect(jobPayloads).toEqual([
      expect.objectContaining({
        skus: ['SKU-1', 'SKU-2'],
        scrapers: ['phillips'],
        max_workers: 4,
        type: 'standard',
        metadata: {
          source: 'login_image_backfill',
          mode: 'scrapers',
          affected_sources: ['phillips'],
        },
        config: {
          sku_context: {
            'SKU-1': {
              product_name: 'SKU-1 Product',
              brand: 'Bay State',
            },
            'SKU-2': {
              product_name: 'SKU-2 Product',
              brand: 'Bay State',
            },
          },
        },
      }),
    ]);
    expect(chunkPayloads).toEqual([
      expect.objectContaining({
        job_id: 'job-1',
        chunk_index: 0,
        skus: ['SKU-1', 'SKU-2'],
        scrapers: ['phillips'],
        status: 'pending',
      }),
    ]);
    expect(auditPayloads).toHaveLength(2);
  });
});
