#!/usr/bin/env bun
/**
 * verify-local-bootstrap.ts
 *
 * Verifies that the local development environment is properly bootstrapped.
 * Checks:
 *   1. Supabase URL is localhost (not production)
 *   2. At least 12 products exist
 *   3. At least 6 brands exist
 *   4. At least 8 categories exist
 *   5. At least 4 services exist
 *   6. Site settings exist
 *   7. Facet definitions and values exist
 *   8. Featured and pickup-only products exist
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks failed
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const LOCAL_PATTERNS = ['localhost', '127.0.0.1'];
const isLocalUrl = LOCAL_PATTERNS.some((pattern) => SUPABASE_URL.includes(pattern));

if (!isLocalUrl) {
  console.error(`❌ SUPABASE_URL is not pointing to localhost: ${SUPABASE_URL}`);
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in .env.local');
  process.exit(1);
}

if (!SUPABASE_SECRET_KEY) {
  console.error('❌ SUPABASE_SECRET_KEY is not set.');
  console.error('   Run `bun run web db:sync-env` to sync keys from Supabase CLI.');
  process.exit(1);
}

console.log('✓ Supabase URL is local');
console.log('');

interface Check {
  name: string;
  passed: boolean;
  detail?: string;
}

const checks: Check[] = [];
let exitCode = 0;

async function runCheck<T>(
  label: string,
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  detailFn?: (result: T) => string,
): Promise<void> {
  try {
    const result = await fn();
    const passed = predicate(result);
    checks.push({
      name: label,
      passed,
      detail: passed ? 'OK' : detailFn ? detailFn(result) : 'FAILED',
    });
    if (!passed) exitCode = 1;
  } catch (err) {
    checks.push({
      name: label,
      passed: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
    exitCode = 1;
  }
}

function buildRestUrl(table: string, filters?: Array<{ column: string; value: string | boolean }>): string {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', '*');

  for (const filter of filters ?? []) {
    const encodedValue = typeof filter.value === 'boolean' ? String(filter.value) : filter.value;
    url.searchParams.set(filter.column, `eq.${encodedValue}`);
  }

  return url.toString();
}

function parseExactCount(contentRange: string | null): number {
  if (!contentRange) {
    throw new Error('Missing content-range header');
  }

  const total = contentRange.split('/').at(-1);
  const parsed = total ? Number.parseInt(total, 10) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid content-range header: ${contentRange}`);
  }

  return parsed;
}

async function countRows(
  table: string,
  filters?: Array<{ column: string; value: string | boolean }>,
): Promise<number> {
  const response = await fetch(buildRestUrl(table, filters), {
    method: 'HEAD',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return parseExactCount(response.headers.get('content-range'));
}

async function main() {
  console.log('🔍 Verifying local bootstrap...\n');

  await runCheck(
    'At least 12 products',
    () => countRows('products'),
    (count) => count >= 12,
    (count) => `Found ${count} products (expected ≥12)`,
  );

  await runCheck(
    'At least 6 brands',
    () => countRows('brands'),
    (count) => count >= 6,
    (count) => `Found ${count} brands (expected ≥6)`,
  );

  await runCheck(
    'At least 8 categories',
    () => countRows('categories'),
    (count) => count >= 8,
    (count) => `Found ${count} categories (expected ≥8)`,
  );

  await runCheck(
    'At least 4 services',
    () => countRows('services'),
    (count) => count >= 4,
    (count) => `Found ${count} services (expected ≥4)`,
  );

  await runCheck(
    'At least 3 site settings',
    () => countRows('site_settings'),
    (count) => count >= 3,
    (count) => `Found ${count} site settings (expected ≥3)`,
  );

  await runCheck(
    'At least 3 facet definitions',
    () => countRows('facet_definitions'),
    (count) => count >= 3,
    (count) => `Found ${count} facet definitions (expected ≥3)`,
  );

  await runCheck(
    'At least 10 facet values',
    () => countRows('facet_values'),
    (count) => count >= 10,
    (count) => `Found ${count} facet values (expected ≥10)`,
  );

  await runCheck(
    'At least 3 pet types',
    () => countRows('pet_types'),
    (count) => count >= 3,
    (count) => `Found ${count} pet types (expected ≥3)`,
  );

  await runCheck(
    'At least 1 featured product',
    () => countRows('product_storefront_settings', [{ column: 'is_featured', value: true }]),
    (count) => count >= 1,
    (count) => `Found ${count} featured products (expected ≥1)`,
  );

  await runCheck(
    'At least 1 pickup-only product',
    () => countRows('product_storefront_settings', [{ column: 'pickup_only', value: true }]),
    (count) => count >= 1,
    (count) => `Found ${count} pickup-only products (expected ≥1)`,
  );

  console.log('Results:');
  for (const check of checks) {
    const icon = check.passed ? '✓' : '✗';
    const detail = check.detail ? ` — ${check.detail}` : '';
    console.log(`  ${icon} ${check.name}${detail}`);
  }

  console.log('\n---');
  if (exitCode === 0) {
    console.log('✅ All checks passed. Local bootstrap verified.\n');
  } else {
    console.log(`❌ ${checks.filter((check) => !check.passed).length} check(s) failed.\n`);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
