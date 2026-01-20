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

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should return error when no SKUs provided', async () => {
        const result = await scrapeProducts([]);
        expect(result.success).toBe(false);
        expect(result.error).toBe('No SKUs provided');
    });

    it('should create 1 job for 1 SKU', async () => {
        mockSupabase.single.mockResolvedValue({ data: { id: 'job-1' }, error: null });
        
        const result = await scrapeProducts(['SKU-1']);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(1);
        expect(result.jobIds).toContain('job-1');
        expect(mockSupabase.insert).toHaveBeenCalledTimes(1);
    });

    it('should create 2 jobs for 2 SKUs', async () => {
        mockSupabase.single
            .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'job-2' }, error: null });
        
        const result = await scrapeProducts(['SKU-1', 'SKU-2']);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(2);
        expect(mockSupabase.insert).toHaveBeenCalledTimes(2);
    });

    it('should create max 3 jobs for 10 SKUs (default maxRunners)', async () => {
        mockSupabase.single
            .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'job-2' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'job-3' }, error: null });
        
        const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`);
        const result = await scrapeProducts(skus);
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(3);
        expect(mockSupabase.insert).toHaveBeenCalledTimes(3);
    });

    it('should respect custom maxRunners option', async () => {
        mockSupabase.single
            .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null })
            .mockResolvedValueOnce({ data: { id: 'job-2' }, error: null });
        
        const skus = Array.from({ length: 10 }, (_, i) => `SKU-${i + 1}`);
        const result = await scrapeProducts(skus, { maxRunners: 2 });
        
        expect(result.success).toBe(true);
        expect(result.jobIds).toHaveLength(2);
        expect(mockSupabase.insert).toHaveBeenCalledTimes(2);
    });

    it('should return error if job creation fails', async () => {
        mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'DB Error' } });
        
        const result = await scrapeProducts(['SKU-1']);
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to create scraping job');
    });
});
