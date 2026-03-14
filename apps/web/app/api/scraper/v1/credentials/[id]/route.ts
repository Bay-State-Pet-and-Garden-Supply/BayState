import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import crypto from 'crypto';

type EncryptedRow = {
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  credential_type: string;
};

type ResolvedCredentials = {
  username: string;
  password: string;
  type: string;
};

function resolveKey(): Buffer {
  const raw = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing encryption key');
  const maybeBase64 = Buffer.from(raw, 'base64');
  if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) return maybeBase64;
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length !== 32) throw new Error('Invalid encryption key length');
  return buf;
}

function decrypt(payload: { encryptedValue: string; iv: string; authTag: string }): string {
  const key = resolveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.encryptedValue, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

function resolveCredentials(rows: EncryptedRow[]): ResolvedCredentials | null {
  let username: string | null = null;
  let password: string | null = null;
  let type = 'basic';

  for (const row of rows) {
    let decrypted: string;
    try {
      decrypted = decrypt({ encryptedValue: row.encrypted_value, iv: row.iv, authTag: row.auth_tag });
    } catch {
      continue;
    }

    try {
      const parsed = JSON.parse(decrypted) as {
        username?: unknown;
        password?: unknown;
        type?: unknown;
      };

      if (typeof parsed.username === 'string' && parsed.username.trim()) {
        username = parsed.username;
      }
      if (typeof parsed.password === 'string' && parsed.password.trim()) {
        password = parsed.password;
      }
      if (typeof parsed.type === 'string' && parsed.type.trim()) {
        type = parsed.type;
      }
    } catch {
      if (row.credential_type === 'login' && decrypted.trim()) {
        username = decrypted;
      } else if (row.credential_type === 'password' && decrypted.trim()) {
        password = decrypted;
      } else if (row.credential_type && row.credential_type !== 'api_key') {
        type = row.credential_type;
      }
    }
  }

  if (!username || !password) {
    return null;
  }

  return { username, password, type };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const auth = await validateRunnerAuth({ apiKey, authorization: request.headers.get('authorization') });
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: scraperSlug } = await params;

    // Check allowed scrapers if configured
    if (auth.allowedScrapers && auth.allowedScrapers.length > 0 && !auth.allowedScrapers.includes(scraperSlug)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('scraper_credentials')
      .select('encrypted_value, iv, auth_tag, credential_type')
      .eq('scraper_slug', scraperSlug);

    if (error || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const resolved = resolveCredentials(data as EncryptedRow[]);
    if (!resolved) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(resolved);
  } catch (err) {
    console.error('[Scraper Credentials API] Request error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
