import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizeScraperSlug, validateRunnerAuth } from '@/lib/scraper-auth';
import { decryptSecret } from '@/lib/ai-scraping/credentials';

type EncryptedRow = {
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  credential_type: string;
};

function tryParseCredentialPayload(value: string): { username?: string; password?: string; api_key?: string; type?: string } | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as { username?: string; password?: string; api_key?: string; type?: string };
  } catch {
    return null;
  }
}

const CREDENTIAL_KEYS: Record<string, { username: string; password: string }> = {
  petfoodex: { username: 'petfoodex_username', password: 'petfoodex_password' },
  phillips: { username: 'phillips_username', password: 'phillips_password' },
  orgill: { username: 'orgill_username', password: 'orgill_password' },
  shopsite: { username: 'shopsite_username', password: 'shopsite_password' },
};

async function getLegacyCredentials(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  scraperSlug: string
): Promise<{ username?: string; password?: string; type?: string } | null> {
  const credentialMapping = CREDENTIAL_KEYS[scraperSlug.toLowerCase()];
  if (!credentialMapping) return null;

  const { data: settings, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [credentialMapping.username, credentialMapping.password]);

  if (error) {
    console.error(`[Credentials] Failed to fetch legacy credentials for ${scraperSlug}:`, error);
    return null;
  }

  const settingsMap = new Map(settings?.map(s => [s.key, s.value]) || []);
  const username = settingsMap.get(credentialMapping.username) as string | undefined;
  const password = settingsMap.get(credentialMapping.password) as string | undefined;

  if (!username || !password) return null;

  console.log(`[Credentials] Providing legacy ${scraperSlug} credentials`);
  return { username, password, type: 'basic' };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const auth = await validateRunnerAuth({ apiKey, authorization: request.headers.get('authorization') });
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const scraperSlug = normalizeScraperSlug(id);

    // Check allowed scrapers if configured
    if (auth.allowedScrapers && auth.allowedScrapers.length > 0 && !auth.allowedScrapers.includes(scraperSlug)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createAdminClient();
    
    // Try encrypted credentials table first
    const { data, error } = await supabase
      .from('scraper_credentials')
      .select('encrypted_value, iv, auth_tag, credential_type')
      .eq('scraper_slug', scraperSlug)
      .order('credential_type', { ascending: true });

    // If encrypted credentials found, decrypt and return them
    if (!error && data && data.length > 0) {
      const rows = data as EncryptedRow[];
      const resolved: { username?: string; password?: string; api_key?: string; type?: string } = {};

      for (const row of rows) {
        let decrypted: string;
        try {
          decrypted = decryptSecret({ encryptedValue: row.encrypted_value, iv: row.iv, authTag: row.auth_tag });
        } catch {
          console.error('[Scraper Credentials API] Decryption failed');
          continue;
        }

        const parsed = tryParseCredentialPayload(decrypted);
        if (parsed) {
          if (parsed.username) resolved.username = parsed.username;
          if (parsed.password) resolved.password = parsed.password;
          if (parsed.api_key) resolved.api_key = parsed.api_key;
          if (parsed.type) resolved.type = parsed.type;
          continue;
        }

        if (row.credential_type === 'login') {
          resolved.username = decrypted;
        } else if (row.credential_type === 'password') {
          resolved.password = decrypted;
        } else if (row.credential_type === 'api_key') {
          resolved.api_key = decrypted;
        }
      }

      if (resolved.username && resolved.password) {
        return NextResponse.json({
          username: resolved.username,
          password: resolved.password,
          ...(resolved.api_key ? { api_key: resolved.api_key } : {}),
          type: resolved.type ?? 'basic',
        });
      }
    }

    // Fallback to legacy app_settings table
    const legacyCreds = await getLegacyCredentials(supabase, scraperSlug);
    if (legacyCreds) {
      return NextResponse.json({
        username: legacyCreds.username,
        password: legacyCreds.password,
        type: legacyCreds.type ?? 'basic',
      });
    }

    // No credentials found in either location
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    console.error('[Scraper Credentials API] Request error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
