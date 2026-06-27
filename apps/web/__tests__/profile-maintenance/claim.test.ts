/**
 * Tests for POST /api/scraper/v1/profile-maintenance/claim
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { validateRunnerAuth } = require('@/lib/scraper-auth');
const { createAdminClient } = require('@/lib/supabase/server');
const { POST } = require('@/app/api/scraper/v1/profile-maintenance/claim/route');

describe('POST /api/scraper/v1/profile-maintenance/claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  /**
   * Create a mock PostgREST query builder that supports chaining.
   * Each chain method returns the same builder for chaining, except the
   * terminal method calls (single, limit, maybeSingle) that resolve.
   */
  function makeQueryBuilder(mockResolveValue: any) {
    const builder: Record<string, jest.Mock> = {};
    const handlers: Record<string, (...args: any[]) => any> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      in: () => builder,
      lt: () => builder,
      range: () => mockResolveValue,
      limit: () => mockResolveValue,
      single: () => mockResolveValue,
      maybeSingle: () => mockResolveValue,
    };
    for (const [key, fn] of Object.entries(handlers)) {
      builder[key] = jest.fn().mockImplementation(fn);
    }
    return builder;
  }

  // Helper: create a mock supabase that simulates various states
  function makeMockWithRunner({ enabled = true, hasCapability = true, capabilities = {} } = {}) {
    const emptyResolve = Promise.resolve({ data: [], error: null });
    const nullResolve = Promise.resolve({ data: null, error: { message: 'not found' } });

    // Runner select builder
    const runnerQueryBuilder = makeQueryBuilder(
      Promise.resolve({
        data: {
          enabled,
          metadata: hasCapability
            ? { capabilities: { profile_maintenance: { enabled: true, ...capabilities } } }
            : { capabilities: {} },
        },
        error: null,
      }),
    );

    // Jobs select builder (empty data for the queued/expired lookups)
    const jobsQueryBuilder = makeQueryBuilder(emptyResolve);

    // Jobs single builder (for buildClaimResponse)
    const jobsSingleResolve = Promise.resolve({ data: null, error: { message: 'not found' } });
    const jobsSingleBuilder = makeQueryBuilder(jobsSingleResolve);

    // Update builders
    const runnerUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const runnerUpdate = jest.fn().mockReturnValue({ eq: runnerUpdateEq });

    const jobUpdateEq = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });
    const jobUpdate = jest.fn().mockReturnValue({ eq: jobUpdateEq });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'scraper_runners') {
          return {
            select: jest.fn().mockReturnValue(runnerQueryBuilder),
            update: runnerUpdate,
          };
        }
        if (table === 'profile_maintenance_jobs') {
          // Return a hybrid: for select() return the query builder,
          // for update() return the update builder
          return {
            select: jest.fn().mockImplementation((_cols?: string) => {
              // On first call (in claim flow) return query builder with empty data
              // On second call (in buildClaimResponse with .single()) return the single builder
              // We use a simple approach - return the queued query builder initially,
              // and the single builder is separate
              return jobsQueryBuilder;
            }),
            update: jobUpdate,
          };
        }
        return { select: jest.fn().mockReturnValue(makeQueryBuilder(emptyResolve)), update: jest.fn() };
      }),
    };

    return { mockClient, runnerUpdateEq, jobUpdateEq };
  }

  it('returns 401 when auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_invalid' },
      }),
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 when runner not found', async () => {
    const resolveValue = Promise.resolve({ data: null, error: { message: 'not found' } });
    const builder = makeQueryBuilder(resolveValue);
    const mockClient = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(builder),
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraver/v1/profile-maintenance/claim', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('returns 403 when runner is disabled', async () => {
    const { mockClient } = makeMockWithRunner({ enabled: false });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('returns job: null with reason when runner lacks profile_maintenance capability', async () => {
    const { mockClient } = makeMockWithRunner({ hasCapability: false });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        body: JSON.stringify({ runner_name: 'test-runner' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBeNull();
    expect(body.reason).toContain('profile_maintenance');
  });

  it('returns job: null when no queued jobs exist', async () => {
    const { mockClient } = makeMockWithRunner();
    // No queued rows means the order/limit returns empty
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        body: JSON.stringify({ runner_name: 'test-runner' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBeNull();
  });

  it('returns job: null with reason when runner does not advertise capability', async () => {
    const resolveValue = Promise.resolve({
      data: { enabled: true, metadata: { capabilities: { packaging_vision: { enabled: true } } } },
      error: null,
    });
    const builder = makeQueryBuilder(resolveValue);
    const mockClient = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(builder),
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBeNull();
    expect(body.reason).toContain('profile_maintenance');
  });

  it('persists capability from request body when not in stored metadata', async () => {
    const runnerResolve = Promise.resolve({
      data: { enabled: true, metadata: { capabilities: {} } },
      error: null,
    });
    const runnerBuilder = makeQueryBuilder(runnerResolve);

    const emptyResolve = Promise.resolve({ data: [], error: null });
    const jobsBuilder = makeQueryBuilder(emptyResolve);

    const runnerUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const runnerUpdate = jest.fn().mockReturnValue({ eq: runnerUpdateEq });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'scraper_runners') {
          return {
            select: jest.fn().mockReturnValue(runnerBuilder),
            update: runnerUpdate,
          };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockReturnValue(jobsBuilder),
            update: jest.fn(),
          };
        }
        return { select: jest.fn(), update: jest.fn() };
      }),
    };

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        body: JSON.stringify({
          runner_name: 'test-runner',
          capabilities: { profile_maintenance: { enabled: true, crawl4ai: true } },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );

    // Should persist the capability (even though no jobs to claim)
    expect(runnerUpdateEq).toHaveBeenCalledWith('name', 'test-runner');
    expect(response.status).toBe(200);
  });

  it('guards max-attempt failure updates with attempt count and expected status', async () => {
    const runnerResolve = Promise.resolve({
      data: {
        enabled: true,
        metadata: { capabilities: { profile_maintenance: { enabled: true, crawl4ai: true } } },
      },
      error: null,
    });
    const runnerBuilder = makeQueryBuilder(runnerResolve);

    const maxedJob = {
      id: '00000000-0000-0000-0000-111111111111',
      attempt_count: 3,
      max_attempts: 3,
      required_capabilities: ['profile_maintenance', 'profile_maintenance.crawl4ai'],
    };
    const firstJobsBuilder = makeQueryBuilder(Promise.resolve({ data: [maxedJob], error: null }));
    const emptyJobsBuilder = makeQueryBuilder(Promise.resolve({ data: [], error: null }));

    let selectCallCount = 0;
    const exhaustedEq = jest.fn().mockReturnThis();
    const exhaustedUpdateBuilder = { eq: exhaustedEq, in: jest.fn().mockReturnThis() };
    const jobUpdate = jest.fn().mockReturnValue(exhaustedUpdateBuilder);

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'scraper_runners') {
          return {
            select: jest.fn().mockReturnValue(runnerBuilder),
            update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockImplementation(() => {
              selectCallCount++;
              return selectCallCount === 1 ? firstJobsBuilder : emptyJobsBuilder;
            }),
            update: jobUpdate,
          };
        }
        return { select: jest.fn(), update: jest.fn() };
      }),
    };

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        body: JSON.stringify({
          runner_name: 'test-runner',
          capabilities: { profile_maintenance: { enabled: true, crawl4ai: true } },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBeNull();
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(exhaustedEq).toHaveBeenCalledWith('id', maxedJob.id);
    expect(exhaustedEq).toHaveBeenCalledWith('attempt_count', maxedJob.attempt_count);
    expect(exhaustedEq).toHaveBeenCalledWith('status', 'queued');
  });

  it('skips unsatisfied-capability jobs and claims a satisfiable later one (head-of-line blocking)', async () => {
    // Return a runner with profile_maintenance and crawl4ai capability.
    const runnerResolve = Promise.resolve({
      data: {
        enabled: true,
        metadata: {
          capabilities: {
            profile_maintenance: {
              enabled: true,
              crawl4ai: true,
            },
          },
        },
      },
      error: null,
    });
    const runnerBuilder = makeQueryBuilder(runnerResolve);

    // First batch: jobs requiring model_schema_draft (runner doesn't have this).
    const unsatisfiedRows = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      attempt_count: 0,
      max_attempts: 3,
      required_capabilities: ['profile_maintenance', 'profile_maintenance.model_schema_draft'],
    }));

    const satisfiableJob = {
      id: '00000000-0000-0000-0000-999999999999',
      attempt_count: 0,
      max_attempts: 3,
      required_capabilities: ['profile_maintenance', 'profile_maintenance.crawl4ai'],
    };

    const firstJobsBuilder = makeQueryBuilder(Promise.resolve({ data: unsatisfiedRows, error: null }));
    const secondJobsBuilder = makeQueryBuilder(Promise.resolve({ data: [satisfiableJob], error: null }));
    const fullJobBuilder = makeQueryBuilder(Promise.resolve({
      data: {
        ...satisfiableJob,
        kind: 'verify_pdp_seed',
        brand_id: null,
        source_slug: null,
        canonical_domain: 'example.com',
        profile_id: null,
        profile_version_id: null,
        browser_profile_id: null,
        payload: { url: 'https://example.com/product/1' },
        lease_token: 'generated-lease-token',
        lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      error: null,
    }));

    let selectCallCount = 0;
    const updateEqStatus = jest.fn().mockResolvedValue({ data: [{ id: satisfiableJob.id }], error: null });
    const updateSelect = jest.fn().mockReturnValue({ eq: updateEqStatus });
    const updateEqAttempt = jest.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = jest.fn().mockReturnValue({ eq: updateEqAttempt });
    const jobUpdate = jest.fn().mockReturnValue({ eq: updateEqId });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'scraper_runners') {
          return {
            select: jest.fn().mockReturnValue(runnerBuilder),
            update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockImplementation((columns?: string) => {
              if (columns === '*') return fullJobBuilder;
              selectCallCount++;
              return selectCallCount === 1 ? firstJobsBuilder : secondJobsBuilder;
            }),
            update: jobUpdate,
          };
        }
        return { select: jest.fn(), update: jest.fn() };
      }),
    };

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const response = await POST(
      new NextRequest('http://localhost/api/scraper/v1/profile-maintenance/claim', {
        method: 'POST',
        body: JSON.stringify({
          runner_name: 'test-runner',
          capabilities: { profile_maintenance: { enabled: true, crawl4ai: true } },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job.job_id).toBe(satisfiableJob.id);
    expect(body.job.kind).toBe('verify_pdp_seed');

    // Verify pagination skipped past the incompatible first page.
    expect(selectCallCount).toBeGreaterThanOrEqual(2);
    expect(updateEqStatus).toHaveBeenCalledWith('status', 'queued');
  });
});

export {};
