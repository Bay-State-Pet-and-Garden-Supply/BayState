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
import {
    getAIScrapingDefaults,
    getAIScrapingRuntimeCredentials,
} from '@/lib/ai-scraping/credentials';
import { getGeminiFeatureFlags } from '@/lib/config/gemini-feature-flags';
import type { NextRequest } from 'next/server';
import {
    RUNNER_BUILD_ID_HEADER,
    RUNNER_BUILD_SHA_HEADER,
} from '@/lib/scraper-runner-version';

jest.mock('@/lib/scraper-auth', () => ({
    validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
    getAIScrapingDefaults: jest.fn(),
    getAIScrapingRuntimeCredentials: jest.fn(),
}));

jest.mock('@/lib/config/gemini-feature-flags', () => ({
    getGeminiFeatureFlags: jest.fn(),
}));

describe('POST /api/scraper/v1/claim-chunk', () => {
    let mockSupabase: any;
    let mockRunnerTable: any;
    let mockSettingsTable: any;

    beforeEach(() => {
        process.env.SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        jest.clearAllMocks();

        mockRunnerTable = {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue({
                data: [{ name: 'test-runner', enabled: true, status: 'online', metadata: {} }],
                error: null,
            }),
        };

        mockSettingsTable = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
                data: {
                    value: {
                        channel: 'latest',
                        build_id: 'build-123',
                        build_sha: 'abc123def456',
                    },
                },
                error: null,
            }),
        };

        mockSupabase = {
            from: jest.fn((table: string) => {
                if (table === 'scraper_runners') {
                    return mockRunnerTable;
                }

                if (table === 'site_settings') {
                    return mockSettingsTable;
                }

                return mockSupabase;
            }),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockResolvedValue({ data: [{ name: 'test-runner' }], error: null }),
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ count: 0 }),
            rpc: jest.fn(),
        };

        (createClient as jest.Mock).mockReturnValue(mockSupabase);
        (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
            llm_base_url: null,
            max_search_results: 5,
            max_steps: 15,
            confidence_threshold: 0.7,
        });
        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue(null);
        (getGeminiFeatureFlags as jest.Mock).mockResolvedValue({
            GEMINI_AI_SEARCH_ENABLED: false,
            GEMINI_CRAWL4AI_ENABLED: false,
            GEMINI_BATCH_ENABLED: false,
            GEMINI_PARALLEL_RUN_ENABLED: false,
            GEMINI_TRAFFIC_PERCENT: 0,
            GEMINI_PARALLEL_SAMPLE_PERCENT: 10,
        });
    });

    const createRequest = (body: any = {}, headers: Record<string, string> = {}) => {
        const reqHeaders = new Map(Object.entries({
            [RUNNER_BUILD_ID_HEADER]: 'build-123',
            [RUNNER_BUILD_SHA_HEADER]: 'abc123def456',
            ...headers,
        }));
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
        mockRunnerTable.select.mockResolvedValueOnce({ data: [], error: null });

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
            gemini_api_key: 'gemini-test-key',
            serper_api_key: 'serper-test-key',
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
                gemini_api_key: 'gemini-test-key',
                serper_api_key: 'serper-test-key',
            },
            feature_flags: {
                GEMINI_AI_SEARCH_ENABLED: false,
                GEMINI_CRAWL4AI_ENABLED: false,
                GEMINI_BATCH_ENABLED: false,
                GEMINI_PARALLEL_RUN_ENABLED: false,
                GEMINI_TRAFFIC_PERCENT: 0,
                GEMINI_PARALLEL_SAMPLE_PERCENT: 10,
            },
        });
        expect(mockRunnerTable.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'busy',
            current_job_id: 'job-1',
        }));
    });

    it('injects discovery LLM defaults for claimed discovery chunks', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });
        (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
            llm_base_url: null,
            max_search_results: 6,
            max_steps: 12,
            confidence_threshold: 0.9,
        });
        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue({
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
            llm_api_key: 'gemini-test-key',
            gemini_api_key: 'gemini-test-key',
        });
        mockSupabase.rpc.mockResolvedValue({
            data: [{
                chunk_id: 'chunk-discovery',
                job_id: 'job-discovery',
                chunk_index: 0,
                skus: ['SKU-1'],
                scrapers: ['ai_discovery'],
                test_mode: false,
                max_workers: 3,
                type: 'discovery',
                config: {},
                lease_token: null,
                lease_expires_at: null,
            }],
            error: null,
        });

        const res = await POST(createRequest({ runner_name: 'test-runner' }));

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.chunk.ai_credentials.llm_provider).toBe('gemini');
        expect(data.chunk.job_config).toMatchObject({
            max_search_results: 6,
            max_steps: 12,
            confidence_threshold: 0.9,
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
        });
        expect(data.chunk.job_config.llm_base_url).toBeUndefined();
        expect(data.chunk.feature_flags.GEMINI_AI_SEARCH_ENABLED).toBe(false);
    });

    it('rejects outdated runners before claiming a chunk', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        const res = await POST(
            createRequest(
                { runner_name: 'test-runner' },
                { [RUNNER_BUILD_ID_HEADER]: 'build-old' }
            )
        );

        expect(res.status).toBe(426);
        await expect(res.json()).resolves.toMatchObject({
            error: 'Runner image update required',
            latest_build_id: 'build-123',
        });
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
});
