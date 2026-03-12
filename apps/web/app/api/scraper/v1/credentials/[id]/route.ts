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

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const auth = await validateRunnerAuth({ apiKey, authorization: request.headers.get('authorization') });
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scraperSlug = params.id;

    // Check allowed scrapers if configured
    if (auth.allowedScrapers && auth.allowedScrapers.length > 0 && !auth.allowedScrapers.includes(scraperSlug)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from('scraper_credentials')
      .select('encrypted_value, iv, auth_tag, credential_type')
      .eq('scraper_slug', scraperSlug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const row = data as EncryptedRow;

    let decrypted: string;
    try {
      decrypted = decrypt({ encryptedValue: row.encrypted_value, iv: row.iv, authTag: row.auth_tag });
    } catch (err) {
      // Do not leak internal error details
      console.error('[Scraper Credentials API] Decryption failed');
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Expect decrypted payload to be JSON: { username, password, type }
    let parsed: { username?: string; password?: string; type?: string } | null = null;
    try {
      parsed = JSON.parse(decrypted);
    } catch (err) {
      console.error('[Scraper Credentials API] Invalid credential payload');
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!parsed || !parsed.username || !parsed.password) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ username: parsed.username, password: parsed.password, type: parsed.type ?? row.credential_type ?? 'basic' });
  } catch (err) {
    console.error('[Scraper Credentials API] Request error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
