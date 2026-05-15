// apps/web/scripts/bundle-seed.ts
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SEED_DIR = join(process.cwd(), 'supabase', 'seed');
const OUTPUT_FILE = join(process.cwd(), 'supabase', 'seed.sql');

async function main() {
  console.log('📦 Bundling seed modules...');
  
  if (!require('fs').existsSync(SEED_DIR)) {
    console.error(`❌ Seed directory not found: ${SEED_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.warn('⚠️ No .sql files found in seed directory.');
    return;
  }

  let combinedSql = '-- =====================================================================\n';
  combinedSql += '-- Generated Seed File (do not edit directly)\n';
  combinedSql += `-- Generated at: ${new Date().toISOString()}\n`;
  combinedSql += '-- =====================================================================\n\n';

  for (const file of files) {
    console.log(`  📄 Adding ${file}...`);
    const content = readFileSync(join(SEED_DIR, file), 'utf8');
    combinedSql += `-- --- Module: ${file} ---\n`;
    combinedSql += content;
    combinedSql += '\n\n';
  }

  writeFileSync(OUTPUT_FILE, combinedSql, 'utf8');
  console.log(`✅ Successfully bundled ${files.length} modules into supabase/seed.sql`);
}

main().catch(console.error);
