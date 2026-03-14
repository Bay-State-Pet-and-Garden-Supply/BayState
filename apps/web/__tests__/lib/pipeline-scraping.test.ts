/**
 * @jest-environment node
 */
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

describe('scrapeProducts', () => {
    let mockSupabase: any;

    const makeSupabaseMock = (options?: {
        jobInsertError?: unknown;
        unitInsertError?: unknown;
        pipelineRows?: Array<{ sku: string; input?: Record<string, unknown> | null }>;
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
        };

        return {
            from: jest.fn().mockImplementation((table: string) => {
                if (table === 'scrape_jobs') return scrapeJobsBuilder;
                if (table === 'scrape_job_chunks') return scrapeUnitsBuilder;
                if (table === 'products_ingestion') return productsIngestionBuilder;
                return scrapeJobsBuilder;
            }),
            _scrapeJobsBuilder: scrapeJobsBuilder,
            _scrapeUnitsBuilder: scrapeUnitsBuilder,
            _productsIngestionBuilder: productsIngestionBuilder,
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

    it('should ignore custom maxRunners and still create one parent job', async () => {
        const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`);
        const result = await scrapeProducts(skus, { maxRunners: 2 });
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(1);
        expect(mockSupabase._scrapeUnitsBuilder.insert).toHaveBeenCalledTimes(1);
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

    it('should retry ai_search job creation with discovery type on legacy constraint', async () => {
        mockSupabase = makeSupabaseMock();
        mockSupabase._scrapeJobsBuilder.single
            .mockResolvedValueOnce({
                data: null,
                error: {
                    code: '23514',
                    message: 'new row for relation "scrape_jobs" violates check constraint "scrape_jobs_type_check"',
                },
            })
            .mockResolvedValueOnce({ data: { id: 'job-legacy' }, error: null });

        (createClient as jest.Mock).mockResolvedValue(mockSupabase);

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'ai_search' });

        expect(result.success).toBe(true);
        expect(result.jobIds).toEqual(['job-legacy']);
        expect(mockSupabase._scrapeJobsBuilder.insert).toHaveBeenCalledTimes(2);
        expect(mockSupabase._scrapeJobsBuilder.insert.mock.calls[0][0].type).toBe('ai_search');
        expect(mockSupabase._scrapeJobsBuilder.insert.mock.calls[1][0].type).toBe('discovery');
    });

    it('should include per-sku input context in ai_search job config', async () => {
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

        const result = await scrapeProducts(['SKU-1'], { enrichment_method: 'ai_search' });

        expect(result.success).toBe(true);
        expect(mockSupabase._productsIngestionBuilder.select).toHaveBeenCalledWith('sku, input');
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
});
