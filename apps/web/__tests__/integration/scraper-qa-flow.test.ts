/**
 * @jest-environment node
 *
 * Integration test for complete scraper QA flow:
 * Admin clicks Run Test → API queues job → Runner executes → Callback updates → UI shows results
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

import { POST as createTestJob } from '@/app/api/admin/scrapers/test/route';
import { GET as getTestJobStatus } from '@/app/api/admin/scrapers/studio/test/[id]/route';
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

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
  SupabaseClient: class {},
}));

// Import mocked modules after jest.mock
const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { NextRequest } = require('next/server');

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
const MOCK_ADMIN_USER = { id: 'admin-123', email: 'admin@example.com', role: 'admin' };
const MOCK_NON_ADMIN_USER = { id: 'user-456', email: 'user@example.com', role: 'customer' };

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
          
          // Parse columns and return only requested fields
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
      data: { user: { id: MOCK_ADMIN_USER.id, email: MOCK_ADMIN_USER.email } },
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

// Helper to create NextRequest mock
function createMockRequest(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
  return new NextRequest(url, init);
}

describe('Scraper QA Flow Integration', () => {
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

  function setupMockScraper(hasAssertions: boolean = true): MockScraperConfig {
    const scraper: MockScraperConfig = {
      id: MOCK_SCRAPER_ID,
      name: 'Test Scraper',
      test_assertions: hasAssertions ? TEST_ASSERTIONS : [],
      health_score: null,
      health_status: null,
      last_test_at: null,
      last_test_result: null,
    };
    state.scrapers.set(scraper.id, scraper);
    return scraper;
  }

  describe('Happy Path: Complete Test Flow', () => {
    it('should complete full flow: queue job → mock runner → callback → UI results', async () => {
      // Setup: Admin auth and existing scraper
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper();

      // Step 1: Admin clicks Run Test → API queues job
      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      expect(queueResponse.status).toBe(200);

      const queueData = await queueResponse.json();
      expect(queueData.job_id).toBeDefined();
      expect(queueData.status).toBe('queued');

      const jobId = queueData.job_id;

      // Step 2: Verify job was created with correct state
      const job = state.jobs.get(jobId);
      expect(job).toBeDefined();
      expect(job?.status).toBe('pending');
      expect(job?.config_id).toBe(MOCK_SCRAPER_ID);
      expect(job?.job_type).toBe('test');

      // Step 3: Simulate runner processing (mock runner execution)
      // Update job status to running
      job!.status = 'running';

      // Step 4: Simulate callback from runner with test results
      const callbackPayload = {
        job_id: jobId,
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

      // Process the callback
      const callbackResult = await processTestResultCallback(
        mockSupabase as any,
        callbackPayload
      );

      expect(callbackResult.success).toBe(true);
      expect(callbackResult.message).toContain('6/6 passed');

      // Step 5: Verify health score was updated in DB
      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(100);
      expect(scraper?.health_status).toBe('healthy');
      expect(scraper?.last_test_at).toBe(NOW);
      expect(scraper?.last_test_result).toBe('passed');

      // Step 6: Simulate UI polling for results
      job!.status = 'completed';
      job!.test_metadata = {
        config_id: MOCK_SCRAPER_ID,
        test_type: 'test',
        summary: {
          passed_count: callbackPayload.summary.passed,
          failed_count: callbackPayload.summary.failed,
          total_skus: callbackPayload.summary.total,
          duration_ms: callbackPayload.duration_ms,
        },
        sku_results: callbackPayload.assertion_results,
      };

      const statusRequest = createMockRequest(
        `http://localhost/api/admin/scrapers/studio/test/${jobId}`
      );

      const statusResponse = await getTestJobStatus(statusRequest, {
        params: Promise.resolve({ id: jobId }),
      });

      expect(statusResponse.status).toBe(200);
      const statusData = await statusResponse.json();

      expect(statusData.id).toBe(jobId);
      expect(statusData.status).toBe('completed');
      expect(statusData.test_status).toBe('passed');
      expect(statusData.summary.total).toBe(6);
      expect(statusData.summary.passed).toBe(6);
      expect(statusData.summary.failed).toBe(0);
      expect(statusData.sku_results).toHaveLength(2);
    });

    it('should handle partial test failures with degraded health status', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper();

      // Queue job
      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      const { job_id: jobId } = await queueResponse.json();

      // Simulate partial failure callback
      const callbackPayload = {
        job_id: jobId,
        config_id: MOCK_SCRAPER_ID,
        status: 'completed' as const,
        runner_name: 'test-runner-001',
        assertion_results: [
          {
            sku: '123456789',
            assertions: [
              { field: 'name', expected: 'Test Product Name', actual: 'Test Product Name', passed: true },
              { field: 'price', expected: '$9.99', actual: '$12.99', passed: false }, // Mismatch
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

      // Verify degraded health status
      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(67); // 2/3 = 67%
      expect(scraper?.health_status).toBe('degraded');
      expect(scraper?.last_test_result).toBe('failed');

      const job = state.jobs.get(jobId)!;
      job.status = 'completed';
      job.test_metadata = {
        config_id: MOCK_SCRAPER_ID,
        test_type: 'test',
        summary: {
          passed_count: callbackPayload.summary.passed,
          failed_count: callbackPayload.summary.failed,
          total_skus: callbackPayload.summary.total,
          duration_ms: callbackPayload.duration_ms,
        },
        sku_results: callbackPayload.assertion_results,
      };

      const statusResponse = await getTestJobStatus(
        createMockRequest(`http://localhost/api/admin/scrapers/studio/test/${jobId}`),
        { params: Promise.resolve({ id: jobId }) }
      );

      const statusData = await statusResponse.json();
      expect(statusData.test_status).toBe('partial');
      expect(statusData.summary.total).toBe(3);
      expect(statusData.summary.passed).toBe(2);
      expect(statusData.summary.failed).toBe(1);
    });
  });

  describe('Error Path: Runner Failure', () => {
    it('should handle runner failures and show error state in UI', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper();

      // Queue job
      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      const { job_id: jobId } = await queueResponse.json();

      // Simulate failure callback from runner
      const callbackPayload = {
        job_id: jobId,
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

      // Should still process successfully (just mark as failed)
      expect(callbackResult.success).toBe(true);

      // Verify broken health status
      const scraper = state.scrapers.get(MOCK_SCRAPER_ID);
      expect(scraper?.health_score).toBe(0);
      expect(scraper?.health_status).toBe('broken');
      expect(scraper?.last_test_result).toBe('failed');

      // Update job for UI check
      const job = state.jobs.get(jobId)!;
      job.status = 'failed';
      job.error_message = callbackPayload.error_message;

      const statusResponse = await getTestJobStatus(
        createMockRequest(`http://localhost/api/admin/scrapers/studio/test/${jobId}`),
        { params: Promise.resolve({ id: jobId }) }
      );

      const statusData = await statusResponse.json();
      expect(statusData.status).toBe('failed');
      expect(statusData.test_status).toBe('failed');
      expect(statusData.error_message).toBe('Connection timeout while accessing supplier website');
    });
  });

  describe('Auth Path: Non-admin Access', () => {
    it('should reject test job creation for non-admin users', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: false,
        response: { status: 403, body: { error: 'Forbidden: Admin or staff access required' } },
      });
      setupMockScraper();

      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      expect(queueResponse.status).toBe(403);

      // Verify no job was created
      expect(state.jobs.size).toBe(0);
    });

    it('should reject status check for unauthorized users', async () => {
      // Setup: Create a job first with admin auth
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper();

      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      const { job_id: jobId } = await queueResponse.json();

      // Now simulate unauthorized user
      mockSupabase.auth.getUser = async () => ({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const statusResponse = await getTestJobStatus(
        createMockRequest(`http://localhost/api/admin/scrapers/studio/test/${jobId}`),
        { params: Promise.resolve({ id: jobId }) }
      );

      expect(statusResponse.status).toBe(401);
    });

    it('should allow staff users to run tests', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: 'staff-123', email: 'staff@example.com' },
        role: 'staff',
      });
      setupMockScraper();

      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      expect(queueResponse.status).toBe(200);

      const queueData = await queueResponse.json();
      expect(queueData.job_id).toBeDefined();
    });
  });

  describe('Validation: Edge Cases', () => {
    it('should return 404 for non-existent scraper', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      // Don't create the scraper

      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: 'non-existent-scraper', type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      expect(queueResponse.status).toBe(404);
    });

    it('should return 400 for scraper without test assertions', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper(false); // Create scraper without assertions

      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      expect(queueResponse.status).toBe(400);

      const data = await queueResponse.json();
      expect(data.error).toContain('test_assertions');
    });

    it('should handle duplicate callbacks idempotently', async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: MOCK_ADMIN_USER,
        role: 'admin',
      });
      setupMockScraper();

      // Queue job
      const queueRequest = createMockRequest(
        'http://localhost/api/admin/scrapers/test',
        {
          method: 'POST',
          body: JSON.stringify({ scraper_id: MOCK_SCRAPER_ID, type: 'test' }),
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const queueResponse = await createTestJob(queueRequest);
      const { job_id: jobId } = await queueResponse.json();

      const callbackPayload = {
        job_id: jobId,
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
