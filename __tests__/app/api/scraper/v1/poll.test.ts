/**
 * @jest-environment node
 */
import { POST } from '@/app/api/scraper/v1/poll/route';
import { NextRequest } from 'next/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

describe('POST /api/scraper/v1/poll', () => {
    let mockSupabase: any;

    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        jest.clearAllMocks();

        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            rpc: jest.fn(),
        };
        (createClient as jest.Mock).mockReturnValue(mockSupabase);
    });

    const createRequest = (body: any = {}, headers: Record<string, string> = {}) => {
        const reqHeaders = new Map(Object.entries(headers));
        return {
            headers: {
                get: (key: string) => reqHeaders.get(key) || null,
            },
            json: async () => body,
        } as unknown as NextRequest;
    };

    it('should return 401 if authentication fails', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized');
    });

    it('should return null job when no pending jobs available', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ 
            runnerName: 'test-runner',
            allowedScrapers: null 
        });
        mockSupabase.update.mockResolvedValue({ error: null });
        mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job).toBeNull();
    });

    it('should return 400 error when job has no SKUs', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ 
            runnerName: 'test-runner',
            allowedScrapers: null 
        });
        mockSupabase.update.mockResolvedValue({ error: null });
        mockSupabase.rpc.mockResolvedValue({ 
            data: [{ job_id: 'job-123', skus: [], scrapers: [], test_mode: false, max_workers: 3 }], 
            error: null 
        });
        mockSupabase.select.mockResolvedValue({ data: [], error: null });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('no SKUs');
    });

    it('should return job successfully when SKUs present', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ 
            runnerName: 'test-runner',
            allowedScrapers: null 
        });
        mockSupabase.update.mockResolvedValue({ error: null });
        mockSupabase.rpc.mockResolvedValue({ 
            data: [{ 
                job_id: 'job-123', 
                skus: ['SKU-1', 'SKU-2'], 
                scrapers: ['petfoodex'], 
                test_mode: false, 
                max_workers: 3 
            }], 
            error: null 
        });
        mockSupabase.select.mockResolvedValue({ 
            data: [{ name: 'petfoodex', disabled: false }], 
            error: null 
        });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job).not.toBeNull();
        expect(data.job.job_id).toBe('job-123');
        expect(data.job.skus).toHaveLength(2);
    });
});
