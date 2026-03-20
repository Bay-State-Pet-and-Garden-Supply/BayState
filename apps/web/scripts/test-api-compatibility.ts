import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ScraperConfigPayload } from '../lib/admin/scrapers/types';

const SCRAPER_SLUGS = [
  'amazon',
  'bradley',
  'central-pet',
  'coastal',
  'mazuri',
  'orgill',
  'petfoodex',
  'phillips',
  'walmart',
] as const;

const REQUIRED_FIELDS = [
  'schema_version',
  'name',
  'display_name',
  'base_url',
  'scraper_type',
  'selectors',
  'workflows',
  'anti_detection',
  'validation',
  'login',
  'timeout',
  'retries',
  'image_quality',
  'test_skus',
  'fake_skus',
  'edge_case_skus',
] as const satisfies readonly (keyof ScraperConfigPayload)[];

interface DbSelectorRow {
  name: string;
  selector: string;
  attribute: string | null;
  multiple: boolean;
  required: boolean;
  sort_order: number;
}

interface DbWorkflowRow {
  action: string;
  name: string | null;
  params: Record<string, unknown>;
  sort_order: number;
}

interface ExpectedOrder {
  selectors: DbSelectorRow[];
  workflows: DbWorkflowRow[];
}

interface ScraperCheckResult {
  slug: string;
  passed: boolean;
  issues: string[];
}

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRequiredFields(slug: string, payload: Record<string, unknown>): string[] {
  const issues: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      issues.push(`Missing required field: ${field}`);
    }
  }

  const schemaVersion = payload.schema_version;
  if (typeof schemaVersion !== 'string' || !schemaVersion.trim()) {
    issues.push('schema_version must be a non-empty string');
  }

  const name = payload.name;
  if (typeof name !== 'string' || !name.trim()) {
    issues.push('name must be a non-empty string');
  } else if (name !== slug) {
    issues.push(`name must match slug (${slug}), received: ${name}`);
  }

  if (typeof payload.display_name !== 'string' || !payload.display_name.trim()) {
    issues.push('display_name must be a non-empty string');
  }

  if (typeof payload.base_url !== 'string' || !payload.base_url.trim()) {
    issues.push('base_url must be a non-empty string');
  }

  if (payload.scraper_type !== 'static' && payload.scraper_type !== 'agentic') {
    issues.push("scraper_type must be either 'static' or 'agentic'");
  }

  if (!Array.isArray(payload.selectors)) {
    issues.push('selectors must be an array');
  }

  if (!Array.isArray(payload.workflows)) {
    issues.push('workflows must be an array');
  }

  if (!isRecord(payload.anti_detection)) {
    issues.push('anti_detection must be an object');
  }

  if (!isRecord(payload.validation)) {
    issues.push('validation must be an object');
  }

  const login = payload.login;
  if (login !== null && !isRecord(login)) {
    issues.push('login must be an object or null');
  }

  if (typeof payload.timeout !== 'number') {
    issues.push('timeout must be a number');
  }

  if (typeof payload.retries !== 'number') {
    issues.push('retries must be a number');
  }

  if (typeof payload.image_quality !== 'number') {
    issues.push('image_quality must be a number');
  }

  if (!Array.isArray(payload.test_skus) || payload.test_skus.some((sku) => typeof sku !== 'string')) {
    issues.push('test_skus must be an array of strings');
  }

  if (!Array.isArray(payload.fake_skus) || payload.fake_skus.some((sku) => typeof sku !== 'string')) {
    issues.push('fake_skus must be an array of strings');
  }

  if (!Array.isArray(payload.edge_case_skus) || payload.edge_case_skus.some((sku) => typeof sku !== 'string')) {
    issues.push('edge_case_skus must be an array of strings');
  }

  return issues;
}

function getApiKey(): string | null {
  return (
    process.env.SCRAPER_API_KEY ??
    process.env.RUNNER_API_KEY ??
    process.env.X_API_KEY ??
    process.env.INTERNAL_SCRAPER_API_KEY ??
    null
  );
}

function getSupabaseAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function fetchExpectedOrder(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ data: ExpectedOrder | null; error: string | null }> {
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('id, current_version_id')
    .eq('slug', slug)
    .single();

  if (configError || !config) {
    return { data: null, error: `Unable to fetch scraper_config for slug '${slug}'` };
  }

  let versionId: string | null = (config as { current_version_id: string | null }).current_version_id;

  if (!versionId) {
    const { data: latestPublished, error: publishedError } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number')
      .eq('config_id', (config as { id: string }).id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1);

    if (publishedError || !latestPublished || latestPublished.length === 0) {
      return { data: null, error: `No published scraper_config_version found for slug '${slug}'` };
    }

    versionId = (latestPublished[0] as { id: string }).id;
  }

  const { data: selectorsData, error: selectorsError } = await supabase
    .from('scraper_selectors')
    .select('name, selector, attribute, multiple, required, sort_order')
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true });

  if (selectorsError) {
    return { data: null, error: `Failed to fetch selectors for slug '${slug}'` };
  }

  const { data: workflowsData, error: workflowsError } = await supabase
    .from('scraper_workflow_steps')
    .select('action, name, params, sort_order')
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true });

  if (workflowsError) {
    return { data: null, error: `Failed to fetch workflows for slug '${slug}'` };
  }

  return {
    data: {
      selectors: (selectorsData ?? []) as DbSelectorRow[],
      workflows: (workflowsData ?? []) as DbWorkflowRow[],
    },
    error: null,
  };
}

function compareArrayOrderingAndValues(
  payload: Record<string, unknown>,
  expectedOrder: ExpectedOrder,
): string[] {
  const issues: string[] = [];

  const selectors = payload.selectors;
  if (Array.isArray(selectors)) {
    if (selectors.length !== expectedOrder.selectors.length) {
      issues.push(
        `selectors length mismatch: API=${selectors.length}, expected=${expectedOrder.selectors.length}`,
      );
    }

    const selectorCompareLength = Math.min(selectors.length, expectedOrder.selectors.length);
    for (let index = 0; index < selectorCompareLength; index += 1) {
      const apiSelector = selectors[index];
      const expectedSelector = expectedOrder.selectors[index];

      const normalizedExpectedSelector = {
        name: expectedSelector.name,
        selector: expectedSelector.selector,
        attribute: expectedSelector.attribute,
        multiple: expectedSelector.multiple,
        required: expectedSelector.required,
      };

      if (!isRecord(apiSelector)) {
        issues.push(`selectors[${index}] is not an object`);
        continue;
      }

      const normalizedApiSelector = {
        name: apiSelector.name,
        selector: apiSelector.selector,
        attribute: apiSelector.attribute ?? null,
        multiple: apiSelector.multiple,
        required: apiSelector.required,
      };

      if (!isDeepStrictEqual(normalizedApiSelector, normalizedExpectedSelector)) {
        issues.push(
          `selectors[${index}] out of order or mismatched (expected sort_order=${expectedSelector.sort_order})`,
        );
      }
    }
  }

  const workflows = payload.workflows;
  if (Array.isArray(workflows)) {
    if (workflows.length !== expectedOrder.workflows.length) {
      issues.push(
        `workflows length mismatch: API=${workflows.length}, expected=${expectedOrder.workflows.length}`,
      );
    }

    const workflowCompareLength = Math.min(workflows.length, expectedOrder.workflows.length);
    for (let index = 0; index < workflowCompareLength; index += 1) {
      const apiWorkflow = workflows[index];
      const expectedWorkflow = expectedOrder.workflows[index];

      const normalizedExpectedWorkflow = {
        action: expectedWorkflow.action,
        name: expectedWorkflow.name,
        params: expectedWorkflow.params ?? {},
      };

      if (!isRecord(apiWorkflow)) {
        issues.push(`workflows[${index}] is not an object`);
        continue;
      }

      const normalizedApiWorkflow = {
        action: apiWorkflow.action,
        name: apiWorkflow.name ?? null,
        params: isRecord(apiWorkflow.params) ? apiWorkflow.params : {},
      };

      if (!isDeepStrictEqual(normalizedApiWorkflow, normalizedExpectedWorkflow)) {
        issues.push(
          `workflows[${index}] out of order or mismatched (expected sort_order=${expectedWorkflow.sort_order})`,
        );
      }
    }
  }

  return issues;
}

async function fetchScraperConfig(
  baseUrl: string,
  slug: string,
  apiKey: string | null,
): Promise<{ payload: Record<string, unknown> | null; error: string | null }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const endpoint = `${baseUrl}/api/internal/scraper-configs/${encodeURIComponent(slug)}`;

  try {
    const response = await fetch(endpoint, { headers });
    const bodyText = await response.text();

    let body: unknown = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!response.ok) {
      const message = isRecord(body) && typeof body.error === 'string'
        ? body.error
        : typeof body === 'string'
          ? body
          : `HTTP ${response.status}`;
      return { payload: null, error: `Request failed (${response.status}): ${message}` };
    }

    if (!isRecord(body)) {
      return { payload: null, error: 'Response body is not a JSON object' };
    }

    return { payload: body, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    return { payload: null, error: `Network error: ${message}` };
  }
}

async function run(): Promise<void> {
  loadDotEnvLocal();

  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
  const apiKey = getApiKey();
  const supabase = getSupabaseAdminClient();

  const globalIssues: string[] = [];
  if (!apiKey) {
    globalIssues.push(
      'No API key found. Set SCRAPER_API_KEY (or RUNNER_API_KEY) to authenticate requests.',
    );
  }
  if (!supabase) {
    globalIssues.push(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Ordering checks require DB access.',
    );
  }

  console.log('API Backward Compatibility Test');
  console.log('================================');
  console.log(`Testing ${SCRAPER_SLUGS.length} scrapers...`);
  console.log('');

  const results: ScraperCheckResult[] = [];

  for (const slug of SCRAPER_SLUGS) {
    const issues: string[] = [];

    const { payload, error } = await fetchScraperConfig(baseUrl, slug, apiKey);
    if (error || !payload) {
      issues.push(error ?? 'Unknown request failure');
      results.push({ slug, passed: false, issues });
      continue;
    }

    issues.push(...validateRequiredFields(slug, payload));

    if (supabase) {
      const expectedOrderResult = await fetchExpectedOrder(supabase, slug);
      if (expectedOrderResult.error || !expectedOrderResult.data) {
        issues.push(expectedOrderResult.error ?? 'Unable to validate ordering from database');
      } else {
        issues.push(...compareArrayOrderingAndValues(payload, expectedOrderResult.data));
      }
    } else {
      issues.push('Skipped ordering validation because Supabase admin credentials are missing');
    }

    results.push({ slug, passed: issues.length === 0, issues });
  }

  let passedCount = 0;

  for (const result of results) {
    if (result.passed) {
      passedCount += 1;
      console.log(`✓ ${result.slug}: PASS (all fields match)`);
      continue;
    }

    console.log(`✗ ${result.slug}: FAIL`);
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }

  if (globalIssues.length > 0) {
    console.log('');
    console.log('Environment issues:');
    for (const issue of globalIssues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('');
  console.log(`Summary: ${passedCount}/${SCRAPER_SLUGS.length} passed`);

  if (passedCount !== SCRAPER_SLUGS.length) {
    process.exitCode = 1;
  }
}

void run();
