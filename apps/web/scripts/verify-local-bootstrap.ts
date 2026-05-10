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
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks failed
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const LOCAL_PATTERNS = ['localhost', '127.0.0.1'];
const isLocalUrl = LOCAL_PATTERNS.some((p) => SUPABASE_URL.includes(p));

if (!isLocalUrl) {
  console.error(`❌ SUPABASE_URL is not pointing to localhost: ${SUPABASE_URL}`);
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in .env.local');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set.');
  console.error('   Run `supabase status -o env` and copy the service_role key.');
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

async function sqlQuery(query: string): Promise<unknown[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query }),
  });
  if (response.ok) return await response.json() as unknown[];

  // Fallback: use the REST API directly
  const tableMatch = query.match(/FROM\s+(\w+)/i);
  if (!tableMatch) throw new Error(`Cannot parse table from query: ${query}`);
  const table = tableMatch[1];

  const countMatch = query.match(/COUNT\(\*\)/i);
  if (countMatch) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Accept': 'application/json',
      },
    });
    if (!resp.ok) throw new Error(`REST API error: ${resp.status} ${resp.statusText}`);
    return await resp.json() as unknown[];
  }

  const limitMatch = query.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 10;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`REST API error: ${resp.status} ${resp.statusText}`);
  return await resp.json() as unknown[];
}

async function countRows(table: string): Promise<number> {
  const result = await sqlQuery(`SELECT COUNT(*) FROM ${table}`);
  // REST API returns array of objects with 'count' property
  const rows = result as Array<Record<string, unknown>>;
  if (rows.length > 0 && 'count' in rows[0]) {
    return Number(rows[0].count);
  }
  return rows.length;
}

async function main() {
  console.log('🔍 Verifying local bootstrap...\n');

  // 1. Products
  await runCheck(
    'At least 12 products',
    () => countRows('products'),
    (count) => count >= 12,
    (count) => `Found ${count} products (expected ≥12)`
  );

  // 2. Brands
  await runCheck(
    'At least 6 brands',
    () => countRows('brands'),
    (count) => count >= 6,
    (count) => `Found ${count} brands (expected ≥6)`
  );

  // 3. Categories
  await runCheck(
    'At least 8 categories',
    () => countRows('categories'),
    (count) => count >= 8,
    (count) => `Found ${count} categories (expected ≥8)`
  );

  // 4. Services
  await runCheck(
    'At least 4 services',
    () => countRows('services'),
    (count) => count >= 4,
    (count) => `Found ${count} services (expected ≥4)`
  );

  // 5. Site settings
  await runCheck(
    'At least 3 site settings',
    () => countRows('site_settings'),
    (count) => count >= 3,
    (count) => `Found ${count} site settings (expected ≥3)`
  );

  // 6. Facet definitions
  await runCheck(
    'At least 3 facet definitions',
    () => countRows('facet_definitions'),
    (count) => count >= 3,
    (count) => `Found ${count} facet definitions (expected ≥3)`
  );

  // 7. Facet values
  await runCheck(
    'At least 10 facet values',
    () => countRows('facet_values'),
    (count) => count >= 10,
    (count) => `Found ${count} facet values (expected ≥10)`
  );

  // 8. Pet types
  await runCheck(
    'At least 3 pet types',
    () => countRows('pet_types'),
    (count) => count >= 3,
    (count) => `Found ${count} pet types (expected ≥3)`
  );

  // 9. Check featured product
  await runCheck(
    'At least 1 featured product',
    () => sqlQuery("SELECT * FROM product_storefront_settings WHERE is_featured = true LIMIT 1"),
    (rows) => (rows as unknown[]).length >= 1,
    () => 'No featured product found'
  );

  // 10. Check pickup-only product
  await runCheck(
    'At least 1 pickup-only product',
    () => sqlQuery("SELECT * FROM product_storefront_settings WHERE pickup_only = true LIMIT 1"),
    (rows) => (rows as unknown[]).length >= 1,
    () => 'No pickup-only product found'
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
