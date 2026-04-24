/**
 * @jest-environment node
 */
import { buildLinearChunkPlan, scrapeProducts } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/admin/scrapers/configs', () => ({
    getLocalScraperConfigs: jest.fn().mockResolvedValue([
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
                website_url?: string | null;
                official_domains?: string[];
                preferred_domains?: string[];
            } | Array<{
                name?: string | null;
                website_url?: string | null;
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
            website_url?: string | null;
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
                website_url?: string | null;
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
    });

    it('should create 1 parent job for 2 SKUs', async () => {
        const result = await scrapeProducts(['SKU-1', 'SKU-2']);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);
    });

    it('should create 1 parent job with claimable units for 10 SKUs', async () => {
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

    it('should delete parent job when unit creation fails', async () => {
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



    it('should include per-sku input context in discovery job config', async () => {
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

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'official_brand' });

        expect(result.success).toBe(true);
        expect(mockSupabase._productsIngestionBuilder.select).toHaveBeenCalledWith('sku, cohort_id, consolidated, input');
        expect(mockSupabase._productsIngestionBuilder.in).toHaveBeenCalledWith('sku', ['SKU-1']);

        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.config.items).toEqual([
            {
                sku: 'SKU-1',
                product_name: 'BENTLEY SEED BROCCOL I GREEN SPROUTING',
                price: 2.49,
                brand: 'Bentley Seed',
                category: 'Seeds',
            },
        ]);
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

    it('should build linear chunk plans for discovery style jobs', async () => {
        const plan = await buildLinearChunkPlan(['SKU-1', 'SKU-2', 'SKU-3'], ['official_brand'], 2);

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
            scrapers: ['official_brand'],
            planned_work_units: 2,
        });
    });

    it('should prefer catalog product context for discovery jobs when available', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    input: {
                        name: 'LV SEED ORGANIC SAGE BROADLEAF HEIRLOOM',
                        price: 2.49,
                    },
                },
            ],
            productRows: [
                {
                    sku: 'SKU-1',
                    name: 'Lake Valley Seed Organic Sage Broadleaf Heirloom',
                    brand: { name: 'Lake Valley Seed' },
                    product_categories: [{ category: { name: 'Seeds' } }],
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'official_brand' });

        expect(result.success).toBe(true);
        expect(mockSupabase._productsBuilder.select).toHaveBeenCalledWith(
            'sku, name, brand:brands(name, website_url, official_domains, preferred_domains), product_categories(category:categories(name))'
        );
        expect(mockSupabase._productsBuilder.in).toHaveBeenCalledWith('sku', ['SKU-1']);

        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.config.items).toEqual([
            {
                sku: 'SKU-1',
                product_name: 'Lake Valley Seed Organic Sage Broadleaf Heirloom',
                price: 2.49,
                brand: 'Lake Valley Seed',
                category: 'Seeds',
            },
        ]);
    });

    it('should include brand domain preferences in discovery job config when available', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    input: {
                        name: 'MIRACLE-GRO POTTING MIX 25 QT',
                        price: 9.99,
                    },
                },
            ],
            productRows: [
                {
                    sku: 'SKU-1',
                    name: 'Miracle-Gro Potting Mix 25 Quart',
                    brand: {
                        name: 'Miracle-Gro',
                        website_url: 'https://www.scottsmiraclegro.com/en-us/brands/miracle-gro',
                        official_domains: ['scottsmiraclegro.com'],
                        preferred_domains: ['homedepot.com', 'lowes.com'],
                    },
                    product_categories: [{ category: { name: 'Garden > Potting Mix' } }],
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'official_brand' });

        expect(result.success).toBe(true);
        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.config.items).toEqual([
            {
                sku: 'SKU-1',
                product_name: 'Miracle-Gro Potting Mix 25 Quart',
                price: 9.99,
                brand: 'Miracle-Gro',
                category: 'Garden > Potting Mix',
                preferred_domains: ['scottsmiraclegro.com', 'homedepot.com', 'lowes.com'],
            },
        ]);
    });

    it('should backfill discovery brand registry domains from consolidated brand id', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    consolidated: {
                        brand_id: 'brand-1',
                    },
                    input: {
                        name: 'Widget 25 QT',
                        price: 9.99,
                        category: 'Garden > Potting Mix',
                    },
                },
            ],
            brandRows: [
                {
                    id: 'brand-1',
                    name: 'Miracle-Gro',
                    slug: 'miracle-gro',
                    website_url: 'https://www.scottsmiraclegro.com/en-us/brands/miracle-gro',
                    official_domains: ['scottsmiraclegro.com'],
                    preferred_domains: ['homedepot.com', 'lowes.com'],
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'official_brand' });

        expect(result.success).toBe(true);
        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.config.items).toEqual([
            {
                sku: 'SKU-1',
                product_name: 'Widget 25 QT',
                price: 9.99,
                brand: 'Miracle-Gro',
                category: 'Garden > Potting Mix',
                preferred_domains: ['scottsmiraclegro.com', 'homedepot.com', 'lowes.com'],
            },
        ]);
    });

    it('should backfill discovery brand registry domains from cohort brand context', async () => {
        mockSupabase = makeSupabaseMock({
            pipelineRows: [
                {
                    sku: 'SKU-1',
                    cohort_id: 'cohort-1',
                    input: {
                        name: 'Tomato Jubilee 1943',
                        price: 2.49,
                        category: 'Vegetable Seeds',
                    },
                },
            ],
            cohortRows: [
                {
                    id: 'cohort-1',
                    brand_name: 'Bentley Seed',
                    brand_id: 'brand-bentley',
                    brands: {
                        id: 'brand-bentley',
                        name: 'Bentley Seed',
                        slug: 'bentley-seed',
                        website_url: 'https://bentleyseeds.com',
                        official_domains: ['bentleyseeds.com'],
                        preferred_domains: ['arett.com'],
                    },
                },
            ],
        });
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], {
            enrichment_method: 'official_brand',
            cohortBrand: 'Bentley Seed',
        });

        expect(result.success).toBe(true);
        const insertedPayload = mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0];
        expect(insertedPayload.config.items).toEqual([
            {
                sku: 'SKU-1',
                product_name: 'Tomato Jubilee 1943',
                price: 2.49,
                brand: 'Bentley Seed',
                category: 'Vegetable Seeds',
                preferred_domains: ['bentleyseeds.com', 'arett.com'],
            },
        ]);
    });
});
