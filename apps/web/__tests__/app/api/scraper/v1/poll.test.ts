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
                ...data
            };
        }
    }
}));

import { POST } from '@/app/api/scraper/v1/poll/route';
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

describe('POST /api/scraper/v1/poll', () => {
    let mockSupabase: any;
    let mockRunnerTable: any;
    let mockSettingsTable: any;

    beforeEach(() => {
        process.env.SUPABASE_URL = 'http://localhost:54321';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
        jest.clearAllMocks();

        mockRunnerTable = {
            update: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue({
                data: [{ name: 'test-runner', enabled: true, status: 'online', metadata: {} }],
                error: null,
            }),
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
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
            eq: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            rpc: jest.fn(),
            channel: jest.fn().mockReturnValue({
                send: jest.fn().mockResolvedValue(undefined)
            }),
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
        mockSupabase.rpc.mockResolvedValue({ 
            data: [{ job_id: 'job-123', skus: [], scrapers: [], test_mode: false, max_workers: 3 }], 
            error: null 
        });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('no SKUs');
    });

    it('returns null job when the runner is disabled', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });
        mockRunnerTable.select.mockResolvedValueOnce({ data: [], error: null });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job).toBeNull();
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('should return job successfully when SKUs present', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({ 
            runnerName: 'test-runner',
            allowedScrapers: null 
        });
        
        const mockScrapers = [{ 
            name: 'petfoodex', 
            disabled: false,
            workflows: [],
            selectors: {},
            timeout: 30
        }];
        
        mockSupabase.eq.mockImplementation(function(this: any) {
            if (this._isScraperQuery) {
                return Promise.resolve({ data: mockScrapers, error: null });
            }
            return this;
        });
        mockSupabase.in.mockImplementation(function(this: any) {
            this._isScraperQuery = true;
            return this;
        });
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

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job).not.toBeNull();
        expect(data.job.job_id).toBe('job-123');
        expect(data.job.skus).toHaveLength(2);
        expect(data.job.feature_flags.GEMINI_AI_SEARCH_ENABLED).toBe(false);
    });

    it('rejects outdated runners before claiming a job', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        const req = createRequest({}, { [RUNNER_BUILD_ID_HEADER]: 'build-old' });
        const res = await POST(req);

        expect(res.status).toBe(426);
        const data = await res.json();
        expect(data.error).toBe('Runner image update required');
        expect(data.latest_build_id).toBe('build-123');
        expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('injects AI credentials and defaults for discovery jobs', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        (getAIScrapingDefaults as jest.Mock).mockResolvedValue({
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
            llm_base_url: null,
            max_search_results: 7,
            max_steps: 20,
            confidence_threshold: 0.82,
        });

        (getAIScrapingRuntimeCredentials as jest.Mock).mockResolvedValue({
            llm_provider: 'gemini',
            llm_model: 'gemini-2.5-flash',
            llm_api_key: 'gemini-test-key',
            gemini_api_key: 'gemini-test-key',
            serpapi_api_key: 'serpapi-test-key',
        });

        const mockScrapers = [
            {
                name: 'ai_discovery',
                status: 'active',
                workflows: [],
                selectors: {},
                timeout: 30,
                base_url: null,
                url_template: null,
                test_skus: null,
            },
        ];

        mockSupabase.eq.mockImplementation(function(this: any) {
            if (this._isScraperQuery) {
                return Promise.resolve({ data: mockScrapers, error: null });
            }
            return this;
        });

        mockSupabase.in.mockImplementation(function(this: any) {
            this._isScraperQuery = true;
            return this;
        });

        mockSupabase.rpc.mockResolvedValue({
            data: [
                {
                    job_id: 'job-discovery',
                    skus: ['SKU-1'],
                    scrapers: ['ai_discovery'],
                    type: 'discovery',
                    config: {},
                    test_mode: false,
                    max_workers: 3,
                },
            ],
            error: null,
        });

        const req = createRequest({});
        const res = await POST(req);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.job.ai_credentials.llm_provider).toBe('gemini');
        expect(data.job.ai_credentials.llm_model).toBe('gemini-2.5-flash');
        expect(data.job.ai_credentials.llm_api_key).toBe('gemini-test-key');
        expect(data.job.ai_credentials.gemini_api_key).toBe('gemini-test-key');
        expect(data.job.ai_credentials.serpapi_api_key).toBe('serpapi-test-key');
        expect(data.job.feature_flags).toMatchObject({
            GEMINI_AI_SEARCH_ENABLED: false,
            GEMINI_CRAWL4AI_ENABLED: false,
        });
        expect(data.job.job_config.max_search_results).toBe(7);
        expect(data.job.job_config.max_steps).toBe(20);
        expect(data.job.job_config.confidence_threshold).toBe(0.82);
        expect(data.job.job_config.llm_provider).toBe('gemini');
        expect(data.job.job_config.llm_model).toBe('gemini-2.5-flash');
        expect(data.job.job_config.llm_base_url).toBeUndefined();
    });

    it('preserves shared discovery keys and strips unsupported ones from discovery job config', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        const mockScrapers = [
            {
                slug: 'ai_discovery',
                scraper_config_versions: {
                    status: 'published',
                    config_legacy: {
                        base_url: 'https://example.com',
                        selectors: [],
                        workflows: [],
                    },
                },
            },
        ];

        mockSupabase.eq.mockImplementation(function(this: any) {
            return this;
        });
        mockSupabase.in.mockResolvedValue({ data: mockScrapers, error: null });

        mockSupabase.rpc.mockResolvedValue({
            data: [
                {
                    job_id: 'job-discovery-cache',
                    skus: ['SKU-1'],
                    scrapers: ['ai_discovery'],
                    type: 'discovery',
                    config: {
                        max_search_results: 6,
                        max_steps: 12,
                        confidence_threshold: 0.9,
                        llm_model: 'gpt-4o',
                        search_provider: 'brave',
                        cache_enabled: false,
                        extraction_strategy: 'auto',
                        timeout: 12345,
                    },
                    test_mode: false,
                    max_workers: 3,
                },
            ],
            error: null,
        });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job.job_config.max_search_results).toBe(6);
        expect(data.job.job_config.max_steps).toBe(12);
        expect(data.job.job_config.confidence_threshold).toBe(0.9);
        expect(data.job.job_config.llm_model).toBe('gpt-4o');
        expect(data.job.job_config.search_provider).toBe('gemini');
        expect(data.job.job_config.cache_enabled).toBe(false);
        expect(data.job.job_config.extraction_strategy).toBe('auto');
        expect(data.job.job_config.timeout).toBeUndefined();
    });

    it('falls back to ai_discovery scraper when discovery job has empty scraper list', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        const mockScrapers = [
            {
                slug: 'ai_discovery',
                scraper_config_versions: {
                    status: 'published',
                    config_legacy: {
                        base_url: 'https://example.com',
                        selectors: [],
                        workflows: [],
                    },
                },
            },
        ];

        mockSupabase.eq.mockImplementation(function(this: any) {
            return this;
        });
        mockSupabase.in.mockResolvedValue({ data: mockScrapers, error: null });

        mockSupabase.rpc.mockResolvedValue({
            data: [
                {
                    job_id: 'job-discovery-empty',
                    skus: ['SKU-1'],
                    scrapers: [],
                    type: 'discovery',
                    config: {},
                    test_mode: false,
                    max_workers: 3,
                },
            ],
            error: null,
        });

        const req = createRequest({});
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.job.scrapers).toHaveLength(0);

        expect(data.job.job_type).toBe('ai_search');
    });

    it('preserves selectors arrays and validation in scraper payload', async () => {
        (validateRunnerAuth as jest.Mock).mockResolvedValue({
            runnerName: 'test-runner',
            allowedScrapers: null,
        });

        const configRow = {
            slug: 'bradley',
            scraper_config_versions: {
                status: 'published',
                config_legacy: {
                    base_url: 'https://www.bradleycaldwell.com',
                    selectors: [
                        { name: 'Name', selector: 'main h1', attribute: 'text' },
                    ],
                    workflows: [{ action: 'extract', name: 'extract', params: { fields: ['Name'] } }],
                    validation: {
                        no_results_selectors: ['main h3:has-text("Sorry")'],
                        no_results_text_patterns: ['Sorry, no results'],
                    },
                    retries: 1,
                    test_skus: ['001135'],
                },
            },
        };

        mockSupabase.eq.mockImplementation(function(this: any) {
            return this;
        });
        mockSupabase.in.mockResolvedValue({ data: [configRow], error: null });

        mockSupabase.rpc.mockResolvedValue({
            data: [{
                job_id: 'job-123',
                skus: ['001135'],
                scrapers: ['bradley'],
                test_mode: true,
                max_workers: 1,
            }],
            error: null,
        });

        const req = createRequest({});
        const res = await POST(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.job.scrapers).toHaveLength(1);
        expect(Array.isArray(data.job.scrapers[0].selectors)).toBe(true);
        expect(data.job.scrapers[0].selectors[0].name).toBe('Name');
        expect(data.job.scrapers[0].validation.no_results_selectors[0]).toContain('Sorry');
        expect(data.job.scrapers[0].retries).toBe(2);
    });
});
