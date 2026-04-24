/**
 * @jest-environment node
 *
 * Integration test for scraper QA callback flow:
 * Runner completes test → Callback POST → Health score updates in DB
 *
 * Tests verify the backend health monitoring pipeline:
 * - processTestResultCallback updates health scores
 * - calculateHealthScore and determineHealthStatus work correctly
 * - Duplicate callbacks are handled idempotently
 */

import { TextEncoder, TextDecoder } from 'util';

// Global setup for Next.js environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === 'undefined') {
  // @ts-ignore
  const { ReadableStream } = require('stream/web');
  global.ReadableStream = ReadableStream;
}

if (typeof (globalThis as any).Request === 'undefined') {
  class Request {}
  (globalThis as any).Request = Request;
}

if (typeof (globalThis as any).Response === 'undefined') {
  class Response {}
  (globalThis as any).Response = Response;
}

import {
  processTestResultCallback,
  calculateHealthScore,
  determineHealthStatus,
} from '@/lib/scraper-callback/test-handler';
import { createClient } from '@/lib/supabase/server';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
  SupabaseClient: class {},
}));

// Types
interface MockScraperConfig {
  id: string;
  name: string;
  test_assertions: Array<{
    sku: string;
    expected: Record<string, unknown>;
  }>;
  health_score: number | null;
  health_status: 'healthy' | 'degraded' | 'broken' | null;
  last_test_at: string | null;
  last_test_result: 'passed' | 'failed' | null;
}

interface MockScrapeJob {
  id: string;
  config_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  job_type: 'test' | 'fake';
  test_metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  skus: string[] | null;
  timeout_at: string | null;
  metadata: Record<string, unknown> | null;
}

interface MockTestRun {
  id: string;
  scraper_id: string;
  job_id: string;
  status: 'success' | 'failed' | 'partial';
  skus_tested: number;
  results: Record<string, unknown>;
  assertion_results: unknown[];
  health_score: number;
  created_at: string;
  completed_at: string;
  duration_ms: number;
}

interface TestState {
  scrapers: Map<string, MockScraperConfig>;
  jobs: Map<string, MockScrapeJob>;
  testRuns: Map<string, MockTestRun>;
  nextIds: { scraper: number; job: number; testRun: number };
}

// Test data
const NOW = '2026-04-23T12:00:00.000Z';
const MOCK_SCRAPER_ID = 'scraper-test-001';

// Test assertions data
const TEST_ASSERTIONS = [
  {
    sku: '123456789',
    expected: {
      name: 'Test Product Name',
      price: '$9.99',
      brand: 'TestBrand',
    },
  },
  {
    sku: '987654321',
    expected: {
      name: 'Another Product',
      price: '$19.99',
      brand: 'AnotherBrand',
    },
  },
];

// Mock state management
function createTestState(): TestState {
  return {
    scrapers: new Map(),
    jobs: new Map(),
    testRuns: new Map(),
    nextIds: { scraper: 1, job: 1, testRun: 1 },
  };
}

// Build mock Supabase client
function buildMockSupabase(state: TestState) {
  const generateId = (prefix: string, counter: keyof typeof state.nextIds) => {
    const id = `${prefix}-${String(state.nextIds[counter]).padStart(3, '0')}`;
    state.nextIds[counter]++;
    return id;
  };

  const scraperConfigsTable = {
    select: (columns: string) => ({
      eq: (column: string, value: string) => ({
        single: async () => {
          const scraper = state.scrapers.get(value);
          if (!scraper) {
            return {
              data: null,
              error: { message: 'Not found', code: 'PGRST116' },
            };
          }

          const fields = columns.split(',').map(f => f.trim());
          const selectedData: Record<string, unknown> = { id: scraper.id };

          fields.forEach((field) => {
            if (field === 'id') selectedData.id = scraper.id;
            if (field === 'name') selectedData.name = scraper.name;
            if (field === 'test_assertions') selectedData.test_assertions = scraper.test_assertions;
            if (field === 'health_score') selectedData.health_score = scraper.health_score;
            if (field === 'health_status') selectedData.health_status = scraper.health_status;
            if (field === 'last_test_at') selectedData.last_test_at = scraper.last_test_at;
            if (field === 'last_test_result') selectedData.last_test_result = scraper.last_test_result;
          });

          return { data: selectedData, error: null };
        },
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: async (column: string, value: string) => {
        const scraper = state.scrapers.get(value);
        if (!scraper) {
          return { error: { message: `Scraper ${value} not found` } };
        }

        Object.assign(scraper, payload, { updated_at: NOW });
        return { error: null };
      },
    }),
  };

  const scrapeJobsTable = {
    select: (columns: string) => ({
      eq: (column: string, value: string) => ({
        single: async () => {
          const job = state.jobs.get(value);
          if (!job) {
            return {
              data: null,
              error: { message: 'Job not found', code: 'PGRST116' },
            };
          }
          return { data: job, error: null };
        },
      }),
      filter: (filterCol: string, op: string, val: string) => ({
        maybeSingle: async () => {
          const job = Array.from(state.jobs.values()).find(j => j.id === val);
          return { data: job || null, error: null };
        },
      }),
    }),
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const insertOne = (data: Record<string, unknown>) => {
        const id = generateId('job', 'job');
        const job: MockScrapeJob = {
          id,
          config_id: String(data.config_id || ''),
          status: String(data.status || 'pending') as MockScrapeJob['status'],
          job_type: String(data.job_type || 'test') as MockScrapeJob['job_type'],
          test_metadata: (data.test_metadata as Record<string, unknown>) || {},
          created_at: NOW,
          completed_at: null,
          error_message: null,
          skus: null,
          timeout_at: null,
          metadata: null,
        };
        state.jobs.set(id, job);
        return job;
      };

      const jobs = Array.isArray(payload) ? payload.map(insertOne) : [insertOne(payload)];
      const job = Array.isArray(payload) ? jobs : jobs[0];

      return {
        select: (columns?: string) => ({
          single: async () => ({ data: job, error: null }),
        }),
      };
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async (column: string, value: string) => {
        const job = state.jobs.get(value);
        if (!job) {
          return { error: { message: `Job ${value} not found` } };
        }

        Object.assign(job, payload, { updated_at: NOW });
        return { error: null };
      },
    }),
  };

  const scraperTestRunsTable = {
    insert: (payload: Record<string, unknown>) => {
      const id = generateId('run', 'testRun');
      const testRun: MockTestRun = {
        id,
        scraper_id: String(payload.scraper_id || ''),
        job_id: String(payload.job_id || ''),
        status: String(payload.status || 'failed') as MockTestRun['status'],
        skus_tested: Number(payload.skus_tested || 0),
        results: (payload.results as Record<string, unknown>) || {},
        assertion_results: (payload.assertion_results as unknown[]) || [],
        health_score: Number((payload.result_data as Record<string, unknown>)?.health_score || 0),
        created_at: NOW,
        completed_at: NOW,
        duration_ms: Number(payload.duration_ms || 0),
      };
      state.testRuns.set(id, testRun);
      return {
        select: (columns?: string) => ({
          single: async () => ({ data: testRun, error: null }),
        }),
      };
    },
  };

  const recordedIdempotencyKeys = new Set<string>();

  const scrapeResultsTable = {
    select: (columns: string) => ({
      filter: (col: string, op: string, val: string) => ({
        maybeSingle: async () => {
          if (col === 'data->_idempotency_key' && recordedIdempotencyKeys.has(val)) {
            return {
              data: {
                id: 'existing-record',
                created_at: NOW,
                data: { _idempotency_key: val },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    }),
    insert: (payload: Record<string, unknown>) => {
      const data = payload.data as Record<string, unknown>;
      if (data?._idempotency_key) {
        recordedIdempotencyKeys.add(String(data._idempotency_key));
      }
      return {
        error: null,
      };
    },
  };

  const scrapeJobChunksTable = {
    select: (columns: string) => ({
      eq: (column: string, value: string) => ({
        single: async () => ({ data: null, error: null }),
      }),
    }),
  };

  const auth = {
    getUser: async () => ({
      data: { user: { id: 'admin-123', email: 'admin@example.com' } },
      error: null,
    }),
  };

  const rpc = async (functionName: string, params: Record<string, unknown>) => {
    if (functionName === 'update_scraper_health_from_test') {
      const scraper = state.scrapers.get(String(params.p_scraper_id || ''));
      if (scraper) {
        const resultData = params.p_result_data as Record<string, unknown>;
        const summary = resultData?.summary as { passed?: number; failed?: number; total?: number };
        if (summary) {
          const score = Math.round(((summary.passed || 0) / (summary.total || 1)) * 100);
          scraper.health_score = score;
          scraper.health_status = score > 80 ? 'healthy' : score >= 50 ? 'degraded' : 'broken';
          scraper.last_test_at = NOW;
          scraper.last_test_result = score > 80 ? 'passed' : 'failed';
        }
      }
      return { error: null };
    }
    return { error: null };
  };

  return {
    from: (table: string) => {
      switch (table) {
        case 'scraper_configs':
          return scraperConfigsTable;
        case 'scrape_jobs':
          return scrapeJobsTable;
        case 'scraper_test_runs':
          return scraperTestRunsTable;
        case 'scrape_results':
          return scrapeResultsTable;
        case 'scrape_job_chunks':
          return scrapeJobChunksTable;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
    auth,
    rpc,
  };
}

describe('Scraper QA Callback Flow', () => {
  let state: TestState;
  let mockSupabase: ReturnType<typeof buildMockSupabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    state = createTestState();
    mockSupabase = buildMockSupabase(state);
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);

    const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
    createSupabaseClient.mockReturnValue(mockSupabase);
  });

  function setupMockScraper(): MockScraperConfig {
    const scraper: MockScraperConfig = {
      id: MOCK_SCRAPER_ID,
      name: 'Test Scraper',
      test_assertions: TEST_ASSERTIONS,
      health_score: null,
      health_status: null,
      last_test_at: null,
      last_test_result: null,
    };
    state.scrapers.set(scraper.id, scraper);
    return scraper;
  }

  describe('Callback: Successful test results update health score', () => {
    it('should update health score to 100 when all assertions pass', async () => {
      setupMockScraper();

      const callbackPayload = {
        job_id: 'job-001',
        config_id: MOCK_SCRAPER_ID,
        status: 'completed' as const,
        runner_name: 'test-runner-001',
        assertion_results: [
          {
            sku: '123456789',
            assertions: [
              { field: 'name', expected: 'Test Product Name', actual: 'Test Product Name', passed: true },
              { field: 'price', expected: '$9.99', actual: '$9.99', passed: true },
              { field: 'brand', expected: 'TestBrand', actual: 'TestBrand', passed: true },
            ],
            passed: true,
            summary: { total: 3, passed: 3, failed: 0 },
          },
          {
            sku: '987654321',
            assertions: [
              { field: 'name', expected: 'Another Product', actual: 'Another Product', passed: true },
              { field: 'price', expected: '$19.99', actual: '$19.99', passed: true },
              { field: 'brand', expected: 'AnotherBrand', actual: 'AnotherBrand', passed: true },
            ],
            passed: true,
            summary: { total: 3, passed: 3, failed: 0 },
          },
        ],
        summary: {
          total: 6,
          passed: 6,
          failed: 0,
        },
        duration_ms: 12345,
      };

      const callbackResult = await processTestResultCallback(
        mockSupabase as any,
        callbackPayload
      );

      expect(callbackResult.success).toBe(true);
      expect(callbackResult.message).toContain('6/6 passed');

      // Verify health score was updated in DB
      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(100);
      expect(scraper?.health_status).toBe('healthy');
      expect(scraper?.last_test_at).toBe(NOW);
      expect(scraper?.last_test_result).toBe('passed');
    });

    it('should set degraded health status for partial failures', async () => {
      setupMockScraper();

      const callbackPayload = {
        job_id: 'job-002',
        config_id: MOCK_SCRAPER_ID,
        status: 'completed' as const,
        runner_name: 'test-runner-001',
        assertion_results: [
          {
            sku: '123456789',
            assertions: [
              { field: 'name', expected: 'Test Product Name', actual: 'Test Product Name', passed: true },
              { field: 'price', expected: '$9.99', actual: '$12.99', passed: false },
            ],
            passed: false,
            summary: { total: 2, passed: 1, failed: 1 },
          },
          {
            sku: '987654321',
            assertions: [
              { field: 'name', expected: 'Another Product', actual: 'Another Product', passed: true },
            ],
            passed: true,
            summary: { total: 1, passed: 1, failed: 0 },
          },
        ],
        summary: {
          total: 3,
          passed: 2,
          failed: 1,
        },
        duration_ms: 10000,
      };

      await processTestResultCallback(mockSupabase as any, callbackPayload);

      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(67); // 2/3 = 67%
      expect(scraper?.health_status).toBe('degraded');
      expect(scraper?.last_test_result).toBe('failed');
    });

    it('should set broken health status when runner fails completely', async () => {
      setupMockScraper();

      const callbackPayload = {
        job_id: 'job-003',
        config_id: MOCK_SCRAPER_ID,
        status: 'failed' as const,
        runner_name: 'test-runner-001',
        assertion_results: [],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
        },
        duration_ms: 5000,
        error_message: 'Connection timeout while accessing supplier website',
      };

      const callbackResult = await processTestResultCallback(
        mockSupabase as any,
        callbackPayload
      );

      expect(callbackResult.success).toBe(true);

      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(0);
      expect(scraper?.health_status).toBe('broken');
      expect(scraper?.last_test_result).toBe('failed');
    });
  });

  describe('Callback: Idempotency', () => {
    it('should handle duplicate callbacks idempotently', async () => {
      setupMockScraper();

      const callbackPayload = {
        job_id: 'job-dup-001',
        config_id: MOCK_SCRAPER_ID,
        status: 'completed' as const,
        runner_name: 'test-runner-001',
        assertion_results: [
          {
            sku: '123456789',
            assertions: [{ field: 'name', expected: 'Test', actual: 'Test', passed: true }],
            passed: true,
            summary: { total: 1, passed: 1, failed: 0 },
          },
        ],
        summary: { total: 1, passed: 1, failed: 0 },
        duration_ms: 5000,
      };

      // First callback
      const result1 = await processTestResultCallback(mockSupabase as any, callbackPayload);
      expect(result1.success).toBe(true);
      expect(result1.idempotent).toBeUndefined();

      // Simulate duplicate callback
      const result2 = await processTestResultCallback(mockSupabase as any, callbackPayload);
      expect(result2.success).toBe(true);
      expect(result2.idempotent).toBe(true);
      expect(result2.message).toContain('already processed');
    });
  });

  describe('Health Score Calculation', () => {
    it('should calculate health score correctly', () => {
      expect(calculateHealthScore({ total: 10, passed: 10, failed: 0 })).toBe(100);
      expect(calculateHealthScore({ total: 10, passed: 8, failed: 2 })).toBe(80);
      expect(calculateHealthScore({ total: 10, passed: 5, failed: 5 })).toBe(50);
      expect(calculateHealthScore({ total: 10, passed: 3, failed: 7 })).toBe(30);
      expect(calculateHealthScore({ total: 0, passed: 0, failed: 0 })).toBe(0);
    });

    it('should determine health status correctly', () => {
      expect(determineHealthStatus(100)).toBe('healthy');
      expect(determineHealthStatus(81)).toBe('healthy');
      expect(determineHealthStatus(80)).toBe('degraded');
      expect(determineHealthStatus(50)).toBe('degraded');
      expect(determineHealthStatus(49)).toBe('broken');
      expect(determineHealthStatus(0)).toBe('broken');
    });
  });
});