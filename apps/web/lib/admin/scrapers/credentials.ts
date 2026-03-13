import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret } from '../../ai-scraping/credentials';

export type ScraperCredentialType = 'login' | 'password' | 'api_key';

export interface ScraperCredentialStatus {
  type: ScraperCredentialType;
  configured: boolean;
  updated_at: string | null;
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getScraperCredentialStatuses(slug: string): Promise<ScraperCredentialStatus[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('scraper_credentials')
    .select('credential_type, updated_at')
    .eq('scraper_slug', slug);

  if (error) {
    throw new Error(`Failed to fetch scraper credential statuses: ${error.message}`);
  }

  const types: ScraperCredentialType[] = ['login', 'password', 'api_key'];
  const statuses: ScraperCredentialStatus[] = types.map(type => ({
    type,
    configured: false,
    updated_at: null
  }));

  for (const row of data || []) {
    const type = row.credential_type as ScraperCredentialType;
    const status = statuses.find(s => s.type === type);
    if (status) {
      status.configured = true;
      status.updated_at = row.updated_at;
    }
  }

  return statuses;
}

export async function setScraperCredential(
  slug: string,
  type: ScraperCredentialType,
  value: string,
  updatedBy: string | null
): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${type} cannot be empty`);
  }

  const encrypted = encryptSecret(trimmed);
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from('scraper_credentials')
    .upsert(
      {
        scraper_slug: slug,
        credential_type: type,
        encrypted_value: encrypted.encryptedValue,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: 1,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: 'scraper_slug,credential_type' }
    );

  if (error) {
    throw new Error(`Failed to store scraper credential ${type}: ${error.message}`);
  }
}

export async function deleteScraperCredential(
  slug: string,
  type: ScraperCredentialType
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('scraper_credentials')
    .delete()
    .eq('scraper_slug', slug)
    .eq('credential_type', type);

  if (error) {
    throw new Error(`Failed to delete scraper credential ${type}: ${error.message}`);
  }
}
