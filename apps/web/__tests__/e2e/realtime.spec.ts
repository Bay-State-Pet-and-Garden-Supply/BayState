import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.PLAYWRIGHT_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';

interface RunnerSeed {
  apiKey: string;
  keyId: string;
  runnerName: string;
}

interface RunSeed {
  apiKey: string;
  jobId: string;
  runnerName: string;
  scraperName: string;
  sku: string;
  keyId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createSupabaseAdmin(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createRunnerApiKey(): { apiKey: string; keyHash: string; keyPrefix: string } {
  const apiKey = `bsr_${crypto.randomBytes(32).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  return {
    apiKey,
    keyHash,
    keyPrefix: apiKey.slice(0, 12),
  };
}

function uniqueSuffix(): string {
  return `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

async function ensureAuthenticatedAdmin(page: Page): Promise<void> {
  await page.goto('/admin/scrapers/runs');
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/login') || page.url().includes('/admin/login')) {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error('Admin authentication is required. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.');
    }

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);

    await Promise.all([
      page.waitForURL(/\/admin\/scrapers\/runs/),
      page.getByRole('button', { name: /sign in/i }).click(),
    ]);
  }

  await expect(page.getByText('Scraper Runs').first()).toBeVisible();
}

async function seedRunner(admin: SupabaseClient, runnerName: string): Promise<RunnerSeed> {
  const now = new Date().toISOString();
  const { apiKey, keyHash, keyPrefix } = createRunnerApiKey();

  const { error: runnerError } = await admin.from('scraper_runners').upsert({
    name: runnerName,
    status: 'offline',
    last_seen_at: now,
    created_at: now,
    metadata: { region: 'e2e', source: 'playwright-realtime-spec' },
  });

  if (runnerError) {
    throw runnerError;
  }

  const { data: keyRow, error: keyError } = await admin
    .from('runner_api_keys')
    .insert({
      runner_name: runnerName,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      description: 'Playwright realtime integration test',
    })
    .select('id')
    .single();

  if (keyError || !keyRow) {
    throw keyError ?? new Error('Failed to create runner API key');
  }

  return {
    apiKey,
    keyId: keyRow.id,
    runnerName,
  };
}

async function seedRealtimeRun(admin: SupabaseClient, options?: { runnerName?: string; scraperName?: string; sku?: string }): Promise<RunSeed> {
  const now = new Date().toISOString();
  const runnerName = options?.runnerName ?? `realtime-runner-${uniqueSuffix()}`;
  const scraperName = options?.scraperName ?? 'realtime-e2e';
  const sku = options?.sku ?? `RT-${uniqueSuffix()}`;
  const jobId = crypto.randomUUID();
  const runner = await seedRunner(admin, runnerName);

  const { error: jobError } = await admin.from('scrape_jobs').insert({
    id: jobId,
    scrapers: [scraperName],
    skus: [sku],
    test_mode: true,
    max_workers: 1,
    status: 'running',
    runner_name: runner.runnerName,
    started_at: now,
    created_at: now,
    updated_at: now,
    heartbeat_at: now,
    progress_percent: 0,
    progress_message: 'Waiting for realtime events',
    progress_phase: 'starting',
    progress_updated_at: now,
    current_sku: sku,
    items_processed: 0,
    items_total: 1,
    last_event_at: now,
  });

  if (jobError) {
    throw jobError;
  }

  const { error: runnerStateError } = await admin
    .from('scraper_runners')
    .update({
      status: 'busy',
      current_job_id: jobId,
      last_seen_at: now,
    })
    .eq('name', runner.runnerName);

  if (runnerStateError) {
    throw runnerStateError;
  }

  return {
    apiKey: runner.apiKey,
    jobId,
    keyId: runner.keyId,
    runnerName: runner.runnerName,
    scraperName,
    sku,
  };
}

async function cleanupRealtimeRun(admin: SupabaseClient, run: RunSeed): Promise<void> {
  await admin.from('scrape_job_logs').delete().eq('job_id', run.jobId);
  await admin.from('scrape_jobs').delete().eq('id', run.jobId);
  await admin.from('runner_api_keys').delete().eq('id', run.keyId);
  await admin.from('scraper_runners').delete().eq('name', run.runnerName);
}

async function emitRunnerProgress(
  request: APIRequestContext,
  run: RunSeed,
  overrides: Partial<{
    current_sku: string;
    items_processed: number;
    items_total: number;
    message: string;
    phase: string;
    progress: number;
  }> = {},
): Promise<void> {
  const response = await request.post(`${BASE_URL}/api/scraper/v1/progress`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': run.apiKey,
    },
    data: {
      job_id: run.jobId,
      progress: overrides.progress ?? 25,
      message: overrides.message ?? 'Realtime progress update',
      phase: overrides.phase ?? 'scraping',
      current_sku: overrides.current_sku ?? run.sku,
      items_processed: overrides.items_processed ?? 1,
      items_total: overrides.items_total ?? 4,
      runner_name: run.runnerName,
      timestamp: new Date().toISOString(),
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function emitRunnerLog(
  request: APIRequestContext,
  run: RunSeed,
  overrides: Partial<{
    level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    message: string;
    phase: string;
    sequence: number;
  }> = {},
): Promise<string> {
  const message = overrides.message ?? `Realtime log ${uniqueSuffix()}`;
  const response = await request.post(`${BASE_URL}/api/scraper/v1/logs`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': run.apiKey,
    },
    data: {
      job_id: run.jobId,
      logs: [
        {
          event_id: crypto.randomUUID(),
          level: overrides.level ?? 'info',
          message,
          timestamp: new Date().toISOString(),
          runner_name: run.runnerName,
          runner_id: run.runnerName,
          scraper_name: run.scraperName,
          sku: run.sku,
          phase: overrides.phase ?? 'scraping',
          sequence: overrides.sequence ?? Date.now(),
          source: 'playwright-realtime-spec',
          details: {
            scenario: 'realtime-e2e',
          },
        },
      ],
    },
  });

  expect(response.ok()).toBeTruthy();
  return message;
}

async function openRunDetails(page: Page, jobId: string): Promise<void> {
  await page.goto(`/admin/scrapers/runs/${jobId}`);
  await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
  await expect(page.getByText('Execution Logs').first()).toBeVisible();
}

async function waitForLiveIndicator(page: Page): Promise<void> {
  await expect(page.getByText(/^Live$/).first()).toBeVisible({ timeout: 15_000 });
}

async function waitForOfflineIndicator(page: Page): Promise<void> {
  await expect
    .poll(async () => page.getByText(/^Offline$/).first().isVisible().catch(() => false), { timeout: 15_000 })
    .toBe(true);
}

function logStream(page: Page) {
  return page.locator('.bg-slate-900').first();
}

async function expectNoFullPageReload(page: Page, previousNavigationCount: number): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => performance.getEntriesByType('navigation').length), { timeout: 5_000 })
    .toBe(previousNavigationCount);
}

function skipNonDesktopProject(testInfo: TestInfo): void {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Realtime integration flow runs once on desktop project.');
}

function skipIfMissingRealtimePrerequisites(): void {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Realtime E2E tests require admin credentials plus Supabase runtime environment variables.',
  );
}

test.describe('Realtime runner logging E2E', () => {
  test('should display runner logs in real-time', async ({ page, request }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(30_000);

    const admin = createSupabaseAdmin();
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page);
      await openRunDetails(page, run.jobId);
      await waitForLiveIndicator(page);

      const navigationCount = await page.evaluate(() => performance.getEntriesByType('navigation').length);

      await emitRunnerProgress(request, run, {
        message: 'Runner connected to realtime pipeline',
        phase: 'streaming',
        progress: 33,
      });

      const logMessage = await emitRunnerLog(request, run, {
        message: `Realtime stream smoke ${uniqueSuffix()}`,
        phase: 'streaming',
      });

      await expect(logStream(page).getByText(logMessage, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Runner connected to realtime pipeline', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expectNoFullPageReload(page, navigationCount);
    } finally {
      await cleanupRealtimeRun(admin, run);
    }
  });

  test('should reconnect and resume after connection drop', async ({ page, request, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(30_000);

    const admin = createSupabaseAdmin();
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page);
      await openRunDetails(page, run.jobId);
      await waitForLiveIndicator(page);

      const beforeDropMessage = await emitRunnerLog(request, run, {
        message: `Before reconnect ${uniqueSuffix()}`,
        phase: 'before-drop',
      });
      await expect(logStream(page).getByText(beforeDropMessage, { exact: true })).toBeVisible({ timeout: 15_000 });

      await context.setOffline(true);
      await waitForOfflineIndicator(page);

      await context.setOffline(false);
      await waitForLiveIndicator(page);

      const afterReconnectMessage = await emitRunnerLog(request, run, {
        message: `After reconnect ${uniqueSuffix()}`,
        phase: 'after-drop',
      });

      await expect(logStream(page).getByText(afterReconnectMessage, { exact: true })).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.setOffline(false);
      await cleanupRealtimeRun(admin, run);
    }
  });

  test('should show connection status indicator', async ({ page, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(30_000);

    const admin = createSupabaseAdmin();
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page);
      await openRunDetails(page, run.jobId);

      await waitForLiveIndicator(page);
      await context.setOffline(true);
      await waitForOfflineIndicator(page);

      await context.setOffline(false);
      await waitForLiveIndicator(page);
    } finally {
      await context.setOffline(false);
      await cleanupRealtimeRun(admin, run);
    }
  });

  test('should handle multiple concurrent runners', async ({ page, request, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(30_000);

    const admin = createSupabaseAdmin();
    const firstRun = await seedRealtimeRun(admin, { scraperName: 'realtime-e2e-alpha', sku: `ALPHA-${uniqueSuffix()}` });
    const secondRun = await seedRealtimeRun(admin, { scraperName: 'realtime-e2e-beta', sku: `BETA-${uniqueSuffix()}` });
    const secondPage = await context.newPage();

    try {
      await ensureAuthenticatedAdmin(page);
      await openRunDetails(page, firstRun.jobId);
      await waitForLiveIndicator(page);

      await openRunDetails(secondPage, secondRun.jobId);
      await waitForLiveIndicator(secondPage);

      const firstMessage = `Concurrent runner alpha ${uniqueSuffix()}`;
      const secondMessage = `Concurrent runner beta ${uniqueSuffix()}`;

      await Promise.all([
        emitRunnerLog(request, firstRun, { message: firstMessage, phase: 'alpha-stream' }),
        emitRunnerLog(request, secondRun, { message: secondMessage, phase: 'beta-stream' }),
      ]);

      await expect(logStream(page).getByText(firstMessage, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(logStream(secondPage).getByText(secondMessage, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(logStream(page).getByText(secondMessage, { exact: true })).toHaveCount(0);
      await expect(logStream(secondPage).getByText(firstMessage, { exact: true })).toHaveCount(0);
    } finally {
      await secondPage.close();
      await cleanupRealtimeRun(admin, firstRun);
      await cleanupRealtimeRun(admin, secondRun);
    }
  });
});
