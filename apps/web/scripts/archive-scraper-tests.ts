/**
 * Archive Script for scraper_tests table
 * 
 * Exports all data from the scraper_tests table to NDJSON format
 * for backup and data retention purposes.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/archive-scraper-tests.ts
 * 
 * Output:
 *   .sisyphus/archive/scraper_tests_YYYYMMDD.ndjson
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TABLE_NAME = 'scraper_tests';

interface ScraperTest {
  id: string;
  name?: string;
  description?: string;
  test_type?: string;
  status?: string;
  scraper_slug?: string;
  config_file?: string;
  test_data?: Record<string, unknown>;
  expected_result?: Record<string, unknown>;
  actual_result?: Record<string, unknown>;
  passed?: boolean;
  error_message?: string;
  duration_ms?: number;
  created_at?: string;
  completed_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

async function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY are set in your environment.'
    );
  }
  
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function ensureDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // Directory already exists
  }
}

function getArchivePath(tableName: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const archiveDir = path.resolve(__dirname, '..', '..', '..', '.sisyphus', 'archive');
  return path.join(archiveDir, `${tableName}_${date}.ndjson`);
}

function computeChecksum(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function getTableSchema(supabase: ReturnType<typeof createClient>, tableName: string) {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', tableName)
    .eq('table_schema', 'public')
    .order('ordinal_position');
  
  if (error) {
    console.warn(`Could not fetch schema for ${tableName}:`, error.message);
    return null;
  }
  
  return data;
}

async function exportTable(supabase: ReturnType<typeof createClient>, tableName: string) {
  console.log(`\n📦 Exporting table: ${tableName}`);
  
  // First, get the row count
  const { count, error: countError } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error(`Error counting rows in ${tableName}:`, countError.message);
    return null;
  }
  
  console.log(`   Total rows: ${count ?? 0}`);
  
  if (!count || count === 0) {
    console.log('   ⚠️  No data to export');
    return {
      rows: [],
      schema: null,
      rowCount: 0,
      fileSize: 0,
      checksum: ''
    };
  }
  
  // Fetch all data (stream in batches for large datasets)
  const allRows: ScraperTest[] = [];
  const batchSize = 1000;
  let offset = 0;
  
  while (offset < count) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error(`Error fetching rows:`, error.message);
      throw error;
    }
    
    if (data) {
      allRows.push(...data);
    }
    
    offset += batchSize;
    console.log(`   Fetched ${allRows.length} / ${count} rows...`);
  }
  
  // Get schema information
  const schema = await getTableSchema(supabase, tableName);
  
  // Convert to NDJSON
  const ndjsonLines = allRows.map(row => JSON.stringify(row));
  const ndjsonContent = ndjsonLines.join('\n') + '\n';
  
  // Write to file
  const archivePath = getArchivePath(tableName);
  await ensureDir(path.dirname(archivePath));
  await fs.writeFile(archivePath, ndjsonContent, { encoding: 'utf-8' });
  
  // Compute checksum
  const checksum = computeChecksum(ndjsonContent);
  const fileSize = Buffer.byteLength(ndjsonContent, 'utf-8');
  
  console.log(`   ✅ Exported ${allRows.length} rows to ${archivePath}`);
  console.log(`   📄 File size: ${(fileSize / 1024).toFixed(2)} KB`);
  console.log(`   🔒 SHA256: ${checksum.slice(0, 16)}...`);
  
  // Verify data integrity
  const verificationResult = await verifyExport(archivePath, allRows.length);
  if (!verificationResult) {
    console.error('   ❌ Verification failed!');
  } else {
    console.log('   ✅ Verification passed');
  }
  
  return {
    rows: allRows,
    schema,
    rowCount: allRows.length,
    fileSize,
    checksum,
    archivePath
  };
}

async function verifyExport(archivePath: string, expectedCount: number): Promise<boolean> {
  try {
    const content = await fs.readFile(archivePath, { encoding: 'utf-8' });
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    if (lines.length !== expectedCount) {
      console.error(`   Row count mismatch: expected ${expectedCount}, got ${lines.length}`);
      return false;
    }
    
    // Verify each line is valid JSON
    for (const line of lines) {
      try {
        JSON.parse(line);
      } catch {
        console.error('   Invalid JSON found in export');
        return false;
      }
    }
    
    return true;
  } catch (e) {
    console.error('   Verification error:', e);
    return false;
  }
}

async function main() {
  console.log('🗄️  Scraper Tests Archive Script');
  console.log('================================\n');
  
  const supabase = await getSupabaseAdmin();
  
  const result = await exportTable(supabase, TABLE_NAME);
  
  if (!result || result.rowCount === 0) {
    console.log('\n❌ No scraper test data found to archive.');
    process.exit(0);
  }
  
  // Generate summary
  console.log('\n📊 Archive Summary');
  console.log('=================');
  console.log(`   Table: ${TABLE_NAME}`);
  console.log(`   Rows exported: ${result.rowCount}`);
  console.log(`   File size: ${(result.fileSize / 1024).toFixed(2)} KB`);
  console.log(`   Checksum: ${result.checksum}`);
  console.log(`   Location: ${result.archivePath}`);
  
  if (result.schema) {
    console.log('\n📋 Schema');
    console.log('--------');
    result.schema.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}${col.is_nullable === 'YES' ? ' (nullable)' : ''}`);
    });
  }
  
  // Save first 3 rows as sample (exclude sensitive data)
  if (result.rows.length > 0) {
    const sampleRows = result.rows.slice(0, 3).map(row => {
      // Remove any sensitive fields
      const { created_by, ...safeRow } = row;
      return safeRow;
    });
    
    console.log('\n📝 Sample Data (first 3 rows)');
    console.log('----------------------------');
    sampleRows.forEach((row, i) => {
      console.log(`   Row ${i + 1}:`, JSON.stringify(row).slice(0, 100) + '...');
    });
  }
  
  console.log('\n✅ Archive complete!');
  
  return result;
}

// Execute when run directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main, exportTable };
