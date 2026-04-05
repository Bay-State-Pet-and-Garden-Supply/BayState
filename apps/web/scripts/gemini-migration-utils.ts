import fs from 'fs/promises';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ConsolidationResult, ProductSource } from '@/lib/consolidation';

export interface GoldenDatasetRecord {
  sku: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  source_count: number;
  generated_at: string;
  expected_output: Partial<ConsolidationResult>;
  product: ProductSource;
  metadata: {
    source: 'products_ingestion';
    pipeline_status: string | null;
    updated_at: string | null;
    expected_source: 'consolidated' | 'storefront_fallback';
  };
}

export function requireServiceRoleClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function resolveScriptPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

export async function writeJsonLines<T>(filePath: string, records: T[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const contents = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(filePath, contents.length > 0 ? `${contents}\n` : '', 'utf8');
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const contents = await fs.readFile(filePath, 'utf8');

  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export function parseIntegerOption(flag: string, value: string | undefined, fallback?: number): number {
  if (!value) {
    if (typeof fallback === 'number') {
      return fallback;
    }
    throw new Error(`Missing value for ${flag}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }

  return parsed;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
