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
      .eq('scraper_slug', scraperSlug)
      .order('credential_type', { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const rows = data as EncryptedRow[];
    const resolved: { username?: string; password?: string; api_key?: string; type?: string } = {};

    for (const row of rows) {
      let decrypted: string;
      try {
        decrypted = decrypt({ encryptedValue: row.encrypted_value, iv: row.iv, authTag: row.auth_tag });
      } catch {
        console.error('[Scraper Credentials API] Decryption failed');
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

    if (!resolved.username || !resolved.password) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      username: resolved.username,
      password: resolved.password,
      ...(resolved.api_key ? { api_key: resolved.api_key } : {}),
      type: resolved.type ?? 'basic',
    });
  } catch {
    console.error('[Scraper Credentials API] Request error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
