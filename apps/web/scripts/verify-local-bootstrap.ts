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

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const LOCAL_PATTERNS = ['localhost', '127.0.0.1'];
const isLocalUrl = LOCAL_PATTERNS.some((p) => SUPABASE_URL.includes(p));

if (!isLocalUrl) {
  console.error(`❌ SUPABASE_URL is not pointing to localhost: ${SUPABASE_URL}`);
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in .env.local');
  process.exit(1);
}

if (!SUPABASE_SECRET_KEY) {
  console.error('❌ SUPABASE_SECRET_KEY is not set.');
  console.error('   Run `supabase status -o env` and copy the secret key.');
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
  detailFn?: (result: T) => string
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

/**
 * Count rows in a table using Supabase client with exact count.
 */
async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Count rows with a filter.
 */
async function countRowsWhere(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  value: unknown
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);

  if (error) {
    throw new Error(`Failed to count ${table} where ${column}=${value}: ${error.message}`);
  }

  return count ?? 0;
}

async function main() {
  console.log('🔍 Verifying local bootstrap...\n');

  // Create Supabase admin client (uses service_role key for full access)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

  // 1. Products
  await runCheck(
    'At least 12 products',
    () => countRows(supabase, 'products'),
    (count) => count >= 12,
    (count) => `Found ${count} products (expected ≥12)`
  );

  // 2. Brands
  await runCheck(
    'At least 6 brands',
    () => countRows(supabase, 'brands'),
    (count) => count >= 6,
    (count) => `Found ${count} brands (expected ≥6)`
  );

  // 3. Categories
  await runCheck(
    'At least 8 categories',
    () => countRows(supabase, 'categories'),
    (count) => count >= 8,
    (count) => `Found ${count} categories (expected ≥8)`
  );

  // 4. Services
  await runCheck(
    'At least 4 services',
    () => countRows(supabase, 'services'),
    (count) => count >= 4,
    (count) => `Found ${count} services (expected ≥4)`
  );

  // 5. Site settings
  await runCheck(
    'At least 3 site settings',
    () => countRows(supabase, 'site_settings'),
    (count) => count >= 3,
    (count) => `Found ${count} site settings (expected ≥3)`
  );

  // 6. Facet definitions
  await runCheck(
    'At least 3 facet definitions',
    () => countRows(supabase, 'facet_definitions'),
    (count) => count >= 3,
    (count) => `Found ${count} facet definitions (expected ≥3)`
  );

  // 7. Facet values
  await runCheck(
    'At least 10 facet values',
    () => countRows(supabase, 'facet_values'),
    (count) => count >= 10,
    (count) => `Found ${count} facet values (expected ≥10)`
  );

  // 8. Pet types
  await runCheck(
    'At least 3 pet types',
    () => countRows(supabase, 'pet_types'),
    (count) => count >= 3,
    (count) => `Found ${count} pet types (expected ≥3)`
  );

  // 9. Check featured product
  await runCheck(
    'At least 1 featured product',
    () => countRowsWhere(supabase, 'product_storefront_settings', 'is_featured', true),
    (count) => count >= 1,
    (count) => `Found ${count} featured products (expected ≥1)`
  );

  // 10. Check pickup-only product
  await runCheck(
    'At least 1 pickup-only product',
    () => countRowsWhere(supabase, 'product_storefront_settings', 'pickup_only', true),
    (count) => count >= 1,
    (count) => `Found ${count} pickup-only products (expected ≥1)`
  );

  // Print results
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
    console.log(`❌ ${checks.filter((c) => !c.passed).length} check(s) failed.\n`);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
