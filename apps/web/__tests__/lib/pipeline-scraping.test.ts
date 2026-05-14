/**
 * @jest-environment node
 */
import { buildLinearChunkPlan, scrapeProducts } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/scrapers/configs-db', () => ({
    getDatabaseScraperConfigs: jest.fn().mockResolvedValue([
        { slug: 'amazon', domain: 'amazon.com', base_url: 'https://amazon.com' },
        { slug: 'target', domain: 'target.com', base_url: 'https://target.com' },
        { slug: 'walmart', domain: 'walmart.com', base_url: 'https://walmart.com' },
    ]),
}));

describe('scrapeProducts', () => {
    let mockSupabase: any;

    const makeSupabaseMock = (options?: {
        jobInsertError?: unknown;
        unitInsertError?: unknown;
        pipelineRows?: Array<{
            sku: string;
            cohort_id?: string | null;
            consolidated?: Record<string, unknown> | null;
            input?: Record<string, unknown> | null;
        }>;
        productRows?: Array<{
            sku: string;
            name?: string | null;
            brand?: {
                name?: string | null;
                official_domains?: string[];
                preferred_domains?: string[];
            } | Array<{
                name?: string | null;
                official_domains?: string[];
                preferred_domains?: string[];
            }> | null;
            product_categories?: Array<{
                category?: { name?: string | null } | Array<{ name?: string | null }> | null;
            }> | null;
        }>;
        brandRows?: Array<{
            id?: string;
            name?: string | null;
            slug?: string | null;
            official_domains?: string[];
            preferred_domains?: string[];
        }>;
        cohortRows?: Array<{
            id: string;
            brand_name?: string | null;
            brand_id?: string | null;
            brands?: {
                id?: string;
                name?: string | null;
                slug?: string | null;
                official_domains?: string[];
                preferred_domains?: string[];
            } | null;
        }>;
    }) => {
        const scrapeJobsBuilder = {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue(
                options?.jobInsertError
                    ? { data: null, error: options.jobInsertError }
                    : { data: { id: 'job-1' }, error: null }
            ),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ error: null }),
        };

        const scrapeUnitsBuilder = {
            insert: jest.fn().mockResolvedValue({ error: options?.unitInsertError ?? null }),
        };

        const productsIngestionBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: options?.pipelineRows ?? [], error: null }),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({ error: null }),
        };

        const productsBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: options?.productRows ?? [], error: null }),
        };

        const brandsBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockImplementation((column: string, values: string[]) => {
                const rows = options?.brandRows ?? [];
                if (column === 'id') {
                    return Promise.resolve({
                        data: rows.filter((row) => row.id && values.includes(row.id)),
                        error: null,
                    });
                }

                if (column === 'slug') {
                    return Promise.resolve({
                        data: rows.filter((row) => row.slug && values.includes(row.slug)),
                        error: null,
                    });
                }

                return Promise.resolve({ data: [], error: null });
            }),
            overlaps: jest.fn().mockResolvedValue({ data: [], error: null }),
        };

        const cohortBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockImplementation((column: string, values: string[]) => {
                if (column !== 'id') {
                    return Promise.resolve({ data: [], error: null });
                }

                return Promise.resolve({
                    data: (options?.cohortRows ?? []).filter((row) => values.includes(row.id)),
                    error: null,
                });
            }),
        };

        return {
            from: jest.fn().mockImplementation((table: string) => {
                if (table === 'scrape_jobs') return scrapeJobsBuilder;
                if (table === 'scrape_job_chunks') return scrapeUnitsBuilder;
                if (table === 'products_ingestion') return productsIngestionBuilder;
                if (table === 'products') return productsBuilder;
                if (table === 'brands') return brandsBuilder;
                if (table === 'cohort_batches') return cohortBuilder;
                return scrapeJobsBuilder;
            }),
            _scrapeJobsBuilder: scrapeJobsBuilder,
            _scrapeUnitsBuilder: scrapeUnitsBuilder,
            _productsIngestionBuilder: productsIngestionBuilder,
            _productsBuilder: productsBuilder,
            _brandsBuilder: brandsBuilder,
            _cohortBuilder: cohortBuilder,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockSupabase = makeSupabaseMock();
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should return error when no SKUs provided', async () => {
        const result = await scrapeProducts([]);
        expect(result.success).toBe(false);
        expect(result.error).toBe('No SKUs provided');
    });

    it('should create 1 job for 1 SKU', async () => {
        const result = await scrapeProducts(['SKU-1']);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(result.jobIds).toContain('job-1');
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);

        const insertedJob = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedJob.type).toBe('standard');
        expect(insertedJob.metadata).toMatchObject({
            source: 'pipeline',
            pipeline_version: 'static_first_v1',
            orchestration_kind: 'static_scrape',
        });
    });

    it('should create 1 parent job for 2 SKUs', async () => {
        const result = await scrapeProducts(['SKU-1', 'SKU-2']);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);
    });

    it('should create 1 parent job with chunks for 10 SKUs', async () => {
        const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`);
        const result = await scrapeProducts(skus);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);
    });

    it('should plan cross-product chunks for sku slices and site groups', async () => {
        const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`);
        const result = await scrapeProducts(skus, {
            scrapers: ['amazon', 'target'],
            chunkSize: 5,
            maxRunners: 2,
        });

        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(result.plannedChunkCount).toBe(4);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);

        const insertedChunks = mockSupabase._scrapeUnitsBuilder.insert.mock.calls[0][0];
        expect(insertedChunks).toHaveLength(4);
        expect(insertedChunks[0]).toMatchObject({
            chunk_index: 0,
            skus: ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5'],
            scrapers: ['amazon'],
            site_group_key: 'amazon.com',
            site_group_label: 'amazon.com',
            planned_work_units: 5,
        });
        expect(insertedChunks[1]).toMatchObject({
            chunk_index: 1,
            skus: ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5'],
            scrapers: ['target'],
            site_group_key: 'target.com',
            planned_work_units: 5,
        });
        expect(mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0].metadata).toMatchObject({
            planning_strategy: 'sku_slices_x_site_groups',
            sku_slice_count: 2,
            site_group_count: 2,
            max_concurrent_chunks: 2,
            planned_chunk_count: 4,
            planned_work_units: 20,
        });
        expect(mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0].items_total).toBe(20);
    });

    it('should preserve all site groups while capping active chunks per job', async () => {
        const skus = ['SKU-1', 'SKU-2'];
        const result = await scrapeProducts(skus, {
            scrapers: ['amazon', 'target', 'walmart'],
            chunkSize: 2,
            maxRunners: 2,
        });

        expect(result.success).toBe(true);
        expect(result.plannedChunkCount).toBe(3);

        const insertedChunks = mockSupabase._scrapeUnitsBuilder.insert.mock.calls[0][0];
        expect(insertedChunks).toHaveLength(3);
        expect(insertedChunks.map((chunk: { site_group_key: string }) => chunk.site_group_key)).toEqual([
            'amazon.com',
            'target.com',
            'walmart.com',
        ]);
        expect(mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0].metadata).toMatchObject({
            max_concurrent_chunks: 2,
            site_group_count: 3,
        });
    });

    it('should delete parent job when chunk creation fails', async () => {
        mockSupabase = makeSupabaseMock({ unitInsertError: { message: 'unit fail' } });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1']);
        expect(result.success).toBe(false);
        expect(mockSupabase._scrapeJobsBuilder.delete).toHaveBeenCalledTimes(1);
    });

    it('should return error if job creation fails', async () => {
        mockSupabase = makeSupabaseMock({ jobInsertError: { message: 'DB Error' } });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
        
        const result = await scrapeProducts(['SKU-1']);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to create scraping job');
    });

    it('should include per-sku input context in standard job config', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    input: {
                        name: 'BENTLEY SEED BROCCOL I GREEN SPROUTING',
                        price: 2.49,
                        brand: 'Bentley Seed',
                        category: 'Seeds',
                    },
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { scrapers: ['amazon'] });

        expect(result.success).toBe(true);
        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.type).toBe('standard');
        expect(insertedPayload.config).toEqual({
            sku_context: {
                'SKU-1': {
                    product_name: 'BENTLEY SEED BROCCOL I GREEN SPROUTING',
                    price: 2.49,
                    brand: 'Bentley Seed',
                    category: 'Seeds',
                },
            },
        });
    });

    it('should transition products to scraping status', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    input: { name: 'Test Product', price: 10.0 },
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { scrapers: ['amazon'] });

        expect(result.success).toBe(true);
        // Products should be moved to 'scraping' status
        expect(mockSupabase._productsIngestionBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({ pipeline_status: 'scraping' })
        );
    });

    it('should support test mode without pipeline status transition', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    input: { name: 'Test Product', price: 10.0 },
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { testMode: true, scrapers: ['amazon'] });

        expect(result.success).toBe(true);
        // In test mode, products_ingestion should NOT have been updated
        expect(mockSupabase._productsIngestionBuilder.update).not.toHaveBeenCalled();
    });
});

describe('buildLinearChunkPlan', () => {
    it('should build linear chunk plans', async () => {
        const plan = await buildLinearChunkPlan(['SKU-1', 'SKU-2', 'SKU-3'], ['amazon'], 2);

        expect(plan.plannedChunkCount).toBe(2);
        expect(plan.plannedWorkUnits).toBe(3);
        expect(plan.metadata).toMatchObject({
            planning_strategy: 'linear_sku_slices',
            planned_chunk_count: 2,
            planned_work_units: 3,
        });
        expect(plan.chunks[0]).toMatchObject({
            chunk_index: 0,
            skus: ['SKU-1', 'SKU-2'],
            scrapers: ['amazon'],
            planned_work_units: 2,
        });
    });
});
