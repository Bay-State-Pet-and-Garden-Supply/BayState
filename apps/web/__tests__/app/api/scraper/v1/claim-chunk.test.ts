/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
    NextRequest: class MockNextRequest {
        headers: Headers;
        url: string;
        constructor(input: string | Request | URL, init?: RequestInit) {
            this.url = typeof input === 'string' ? input : 'http://localhost';
            this.headers = new Headers(init?.headers || {});
        }
        async json() { return {}; }
    },
    NextResponse: {
        json: (data: any, init?: ResponseInit) => {
            const status = init?.status || 200;
            return {
                status,
                json: async () => data,
                ...data,
            };
        }
    }
}));

import { POST } from '@/app/api/scraper/v1/claim-chunk/route';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';
import { getAIScrapingRuntimeCredentials } from '@/lib/ai-scraping/credentials';
import type { NextRequest } from 'next/server';

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
    getAIScrapingRuntimeCredentials: jest.fn(),
}));

describe('POST /api/scraper/v1/claim-chunk', () => {
    let mockSupabase: any;

    beforeEach(() => {
        process.env.SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        jest.clearAllMocks();

        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockResolvedValue({ data: [{ name: 'test-runner' }], error: null }),
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ count: 0 }),
            rpc: jest.fn(),
        };

        (createClient as jest.Mock).mockReturnValue(mockSupabase);
        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue(null);
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

    it('returns 401 if authentication fails', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

        const res = await POST(createRequest({}));

        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns no chunk when the runner is disabled', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });
        mockSupabase.neq.mockResolvedValueOnce({ data: [], error: null });

        const res = await POST(createRequest({ runner_name: 'test-runner' }));

        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            chunk: null,
            message: 'Runner is disabled or paused',
        });
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('returns a claimed chunk for an enabled runner', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });
        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue({
            openai_api_key: 'sk-test-key',
            serpapi_api_key: 'serpapi-test-key',
        });
        mockSupabase.rpc.mockResolvedValue({
            data: [{
                chunk_id: 'chunk-1',
                job_id: 'job-1',
                chunk_index: 0,
                skus: ['SKU-1'],
                scrapers: ['bradley'],
                test_mode: false,
                max_workers: 3,
                type: 'standard',
                config: null,
                lease_token: null,
                lease_expires_at: null,
            }],
            error: null,
        });

        const res = await POST(createRequest({ runner_name: 'test-runner' }));

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.chunk).toMatchObject({
            chunk_id: 'chunk-1',
            job_id: 'job-1',
            chunk_index: 0,
            skus: ['SKU-1'],
            scrapers: ['bradley'],
            ai_credentials: {
                openai_api_key: 'sk-test-key',
                serpapi_api_key: 'serpapi-test-key',
            },
        });
        expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'busy',
            current_job_id: 'job-1',
        }));
    });
});
