import crypto from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';

loadEnvConfig(process.cwd());

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.PLAYWRIGHT_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
const MEMORY_GROWTH_LIMIT = 1.1;
const SUBSCRIBE_CYCLE_COUNT = 100;
const MOUNT_CYCLE_COUNT = 100;
const STREAM_STEADY_STATE_LOG_COUNT = 2000;
const STREAM_EXTRA_LOG_COUNT = 1000;
const LOG_BATCH_SIZE = 100;
const HEAP_SNAPSHOT_NODE_NAMES = ['RealtimeChannel'] as const;

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

interface AuthCredentials {
  email: string;
  password: string;
  userId: string | null;
}

interface BrowserMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface HeapSnapshotMeta {
  snapshot: {
    meta: {
      node_fields: string[];
    };
  };
  nodes: number[];
  strings: string[];
}

interface HeapMetrics {
  memory: BrowserMemory;
  snapshotBytes: number;
  snapshotNodeCount: number;
  namedNodeCounts: Record<string, number>;
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

function skipNonDesktopProject(testInfo: TestInfo): void {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Memory leak flow runs once on desktop project.');
}

function skipIfMissingRealtimePrerequisites(): void {
  test.skip(
    !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Memory leak E2E tests require Supabase runtime environment variables.',
  );
}

async function resolveAuthCredentials(admin: SupabaseClient): Promise<AuthCredentials> {
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    return {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: null,
    };
  }

  const email = `memory-leak-e2e-${uniqueSuffix()}@example.com`;
  const password = `E2E-${crypto.randomBytes(18).toString('base64url')}!aA1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw error ?? new Error('Failed to create temporary auth user for memory leak test.');
  }

  return {
    email,
    password,
    userId: data.user.id,
  };
}

async function cleanupAuthCredentials(admin: SupabaseClient, credentials: AuthCredentials): Promise<void> {
  if (!credentials.userId) {
    return;
  }

  await admin.auth.admin.deleteUser(credentials.userId);
}

async function ensureAuthenticatedAdmin(page: Page, credentials: AuthCredentials): Promise<void> {
  await page.goto('/admin/scrapers/runs');
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/login') || page.url().includes('/admin/login')) {
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);

    await Promise.all([
      page.waitForURL(/\/admin\/scrapers\/runs/),
      page.getByRole('button', { name: /^sign in$/i }).click(),
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
    metadata: { region: 'e2e', source: 'playwright-memory-leak-spec' },
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
      description: 'Playwright memory leak test',
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
  const runnerName = options?.runnerName ?? `memory-leak-runner-${uniqueSuffix()}`;
  const scraperName = options?.scraperName ?? 'memory-leak-e2e';
  const sku = options?.sku ?? `ML-${uniqueSuffix()}`;
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
    progress_message: 'Waiting for memory leak scenario',
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

async function openRunDetails(page: Page, jobId: string): Promise<void> {
  await page.goto(`/admin/scrapers/runs/${jobId}`);
  await expect(page.getByRole('heading', { name: 'Run Details' })).toBeVisible();
  await expect(page.getByText('Execution Logs').first()).toBeVisible();
}

async function waitForLiveIndicator(page: Page): Promise<void> {
  await expect(page.getByText(/^Live$/).first()).toBeVisible({ timeout: 15_000 });
}

function logStream(page: Page) {
  return page.locator('.bg-slate-900').first();
}

async function createMemorySession(context: BrowserContext, page: Page): Promise<CDPSession> {
  const session = await context.newCDPSession(page);
  await session.send('HeapProfiler.enable');
  await session.send('Runtime.enable');
  return session;
}

async function installGarbageCollectionBridge(page: Page, session: CDPSession): Promise<void> {
  await page.exposeFunction('__pwForceGc', async () => {
    await session.send('HeapProfiler.collectGarbage');
  });

  await page.addInitScript(() => {
    const target = window as typeof window & {
      __pwForceGc?: () => Promise<void>;
      gc?: () => Promise<void>;
    };

    target.gc = () => target.__pwForceGc?.() ?? Promise.resolve();
  });
}

async function forceGarbageCollection(page: Page, session: CDPSession): Promise<void> {
  await session.send('HeapProfiler.collectGarbage');
  await page.evaluate(async () => {
    if (typeof window.gc === 'function') {
      await window.gc();
    }
  });
  await session.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(50);
}

async function takeHeapSnapshot(session: CDPSession): Promise<string> {
  let snapshot = '';
  const handleChunk = ({ chunk }: { chunk: string }) => {
    snapshot += chunk;
  };

  session.on('HeapProfiler.addHeapSnapshotChunk', handleChunk);

  try {
    await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    session.off('HeapProfiler.addHeapSnapshotChunk', handleChunk);
  }

  return snapshot;
}

function summarizeHeapSnapshot(snapshotText: string): Omit<HeapMetrics, 'memory'> {
  const parsedSnapshot = JSON.parse(snapshotText) as HeapSnapshotMeta;
  const nodeFields = parsedSnapshot.snapshot.meta.node_fields;
  const nameFieldIndex = nodeFields.indexOf('name');

  if (nameFieldIndex === -1) {
    throw new Error('Heap snapshot did not include node name metadata.');
  }

  const nodeFieldCount = nodeFields.length;
  const namedNodeCounts = Object.fromEntries(HEAP_SNAPSHOT_NODE_NAMES.map((name) => [name, 0]));

  for (let nodeIndex = 0; nodeIndex < parsedSnapshot.nodes.length; nodeIndex += nodeFieldCount) {
    const stringIndex = parsedSnapshot.nodes[nodeIndex + nameFieldIndex];
    const nodeName = parsedSnapshot.strings[stringIndex];

    if (nodeName in namedNodeCounts) {
      namedNodeCounts[nodeName] += 1;
    }
  }

  return {
    snapshotBytes: Buffer.byteLength(snapshotText, 'utf8'),
    snapshotNodeCount: parsedSnapshot.nodes.length / nodeFieldCount,
    namedNodeCounts,
  };
}

async function collectHeapMetrics(page: Page, session: CDPSession): Promise<HeapMetrics> {
  await forceGarbageCollection(page, session);

  const memory = await page.evaluate(() => {
    const memoryInfo = (performance as Performance & { memory?: BrowserMemory }).memory;

    if (!memoryInfo) {
      throw new Error('performance.memory is unavailable in this browser context.');
    }

    return {
      usedJSHeapSize: memoryInfo.usedJSHeapSize,
      totalJSHeapSize: memoryInfo.totalJSHeapSize,
      jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit,
    };
  });

  const snapshotText = await takeHeapSnapshot(session);
  return {
    memory,
    ...summarizeHeapSnapshot(snapshotText),
  };
}

function expectHeapGrowthWithinLimit(before: HeapMetrics, after: HeapMetrics, label: string): void {
  expect(
    after.memory.usedJSHeapSize,
    `${label}: usedJSHeapSize grew from ${before.memory.usedJSHeapSize} to ${after.memory.usedJSHeapSize}`,
  ).toBeLessThan(before.memory.usedJSHeapSize * MEMORY_GROWTH_LIMIT);

  expect(
    after.snapshotBytes,
    `${label}: heap snapshot grew from ${before.snapshotBytes} to ${after.snapshotBytes}`,
  ).toBeLessThan(before.snapshotBytes * MEMORY_GROWTH_LIMIT);
}

async function runMountUnmountCycles(page: Page, jobId: string, cycles: number): Promise<void> {
  for (let index = 0; index < cycles; index += 1) {
    await page.goto('about:blank');
    await openRunDetails(page, jobId);
    await waitForLiveIndicator(page);
  }
}

async function emitRunnerLogs(
  request: APIRequestContext,
  run: RunSeed,
  options: {
    count: number;
    prefix: string;
    sequenceStart?: number;
  },
): Promise<{ lastMessage: string; nextSequence: number }> {
  const streamId = uniqueSuffix();
  let sequence = options.sequenceStart ?? 1;
  let lastMessage = `${options.prefix}-0-${streamId}`;

  for (let index = 0; index < options.count; index += LOG_BATCH_SIZE) {
    const batchSize = Math.min(LOG_BATCH_SIZE, options.count - index);
    const logs = Array.from({ length: batchSize }, (_, batchIndex) => {
      const currentSequence = sequence + batchIndex;
      const message = `${options.prefix}-${currentSequence}-${streamId}`;
      lastMessage = message;

      return {
        event_id: crypto.randomUUID(),
        level: 'info' as const,
        message,
        timestamp: new Date().toISOString(),
        runner_name: run.runnerName,
        runner_id: run.runnerName,
        scraper_name: run.scraperName,
        sku: run.sku,
        phase: 'streaming',
        sequence: currentSequence,
        source: 'playwright-memory-leak-spec',
        details: {
          scenario: 'memory-leak-e2e',
          batch: index / LOG_BATCH_SIZE,
        },
      };
    });

    const response = await request.post(`${BASE_URL}/api/scraper/v1/logs`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': run.apiKey,
      },
      data: {
        job_id: run.jobId,
        logs,
      },
    });

    expect(response.ok()).toBeTruthy();
    sequence += batchSize;
  }

  return {
    lastMessage,
    nextSequence: sequence,
  };
}

test.describe('Realtime memory leak E2E', () => {
  test('should not leak memory after 100 mount/unmount cycles', async ({ page, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(180_000);

    const session = await createMemorySession(context, page);
    await installGarbageCollectionBridge(page, session);

    const admin = createSupabaseAdmin();
    const credentials = await resolveAuthCredentials(admin);
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page, credentials);
      await openRunDetails(page, run.jobId);
      await waitForLiveIndicator(page);

      const initialMetrics = await collectHeapMetrics(page, session);

      await runMountUnmountCycles(page, run.jobId, MOUNT_CYCLE_COUNT);

      const finalMetrics = await collectHeapMetrics(page, session);

      expectHeapGrowthWithinLimit(initialMetrics, finalMetrics, 'mount/unmount cycles');
    } finally {
      await cleanupRealtimeRun(admin, run);
      await cleanupAuthCredentials(admin, credentials);
    }
  });

  test('should not leak channels after 100 subscribe/unsubscribe cycles', async ({ page, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(180_000);

    const session = await createMemorySession(context, page);
    await installGarbageCollectionBridge(page, session);

    const admin = createSupabaseAdmin();
    const credentials = await resolveAuthCredentials(admin);
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page, credentials);
      await openRunDetails(page, run.jobId);
      await waitForLiveIndicator(page);

      const initialMetrics = await collectHeapMetrics(page, session);

      await runMountUnmountCycles(page, run.jobId, SUBSCRIBE_CYCLE_COUNT);

      const finalMetrics = await collectHeapMetrics(page, session);

      expect(
        finalMetrics.namedNodeCounts.RealtimeChannel,
        `RealtimeChannel objects leaked: ${initialMetrics.namedNodeCounts.RealtimeChannel} -> ${finalMetrics.namedNodeCounts.RealtimeChannel}`,
      ).toBeLessThanOrEqual(initialMetrics.namedNodeCounts.RealtimeChannel + 1);

      expectHeapGrowthWithinLimit(initialMetrics, finalMetrics, 'subscribe/unsubscribe cycles');
    } finally {
      await cleanupRealtimeRun(admin, run);
      await cleanupAuthCredentials(admin, credentials);
    }
  });

  test('should not grow unbounded with continuous log streaming', async ({ page, request, context }, testInfo) => {
    skipNonDesktopProject(testInfo);
    skipIfMissingRealtimePrerequisites();
    test.setTimeout(180_000);

    const session = await createMemorySession(context, page);
    await installGarbageCollectionBridge(page, session);

    const admin = createSupabaseAdmin();
    const credentials = await resolveAuthCredentials(admin);
    const run = await seedRealtimeRun(admin);

    try {
      await ensureAuthenticatedAdmin(page, credentials);
      await openRunDetails(page, run.jobId);
      await waitForLiveIndicator(page);

      const steadyState = await emitRunnerLogs(request, run, {
        count: STREAM_STEADY_STATE_LOG_COUNT,
        prefix: 'steady-stream',
      });

      await expect(logStream(page).getByText(steadyState.lastMessage, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(`Execution Logs (${STREAM_STEADY_STATE_LOG_COUNT})`, { exact: false })).toBeVisible({ timeout: 30_000 });

      const steadyStateMetrics = await collectHeapMetrics(page, session);

      const continuedStream = await emitRunnerLogs(request, run, {
        count: STREAM_EXTRA_LOG_COUNT,
        prefix: 'continued-stream',
        sequenceStart: steadyState.nextSequence,
      });

      await expect(logStream(page).getByText(continuedStream.lastMessage, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(`Execution Logs (${STREAM_STEADY_STATE_LOG_COUNT})`, { exact: false })).toBeVisible({ timeout: 30_000 });

      const finalMetrics = await collectHeapMetrics(page, session);

      expectHeapGrowthWithinLimit(steadyStateMetrics, finalMetrics, 'continuous log streaming');
    } finally {
      await cleanupRealtimeRun(admin, run);
      await cleanupAuthCredentials(admin, credentials);
    }
  });
});
