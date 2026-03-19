/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: ResponseInit) => ({
      status: init?.status || 200,
      json: async () => data,
      ...data,
    }),
  },
}));

jest.mock('@/lib/scraper-auth', () => {
  const actual = jest.requireActual('@/lib/scraper-auth');
  return {
    ...actual,
    validateRunnerAuth: jest.fn(),
  };
});

jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

import crypto from 'crypto';

import { GET } from '@/app/api/scraper/v1/credentials/[id]/route';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createAdminClient } from '@/lib/supabase/server';

function encryptSecret(value: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted_value: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

describe('GET /api/scraper/v1/credentials/[id]', () => {
  const encryptionKey = Buffer.from('12345678901234567890123456789012', 'utf8');
  const mockValidateRunnerAuth = validateRunnerAuth as jest.Mock;
  const mockCreateAdminClient = createAdminClient as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = encryptionKey.toString('utf8');
    mockValidateRunnerAuth.mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
      allowedScrapers: null,
    });
  });

  function createRequest(headers: Record<string, string> = {}) {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
      },
    } as unknown as Request;
  }

  function mockCredentialRows(
    rows: Array<Record<string, string>>,
    options?: {
      error?: unknown;
      legacySettings?: Array<{ key: string; value: string }>;
      legacyError?: unknown;
    }
  ) {
    const order = jest.fn().mockResolvedValue({ data: rows, error: options?.error ?? null });
    const eq = jest.fn().mockReturnValue({ order });
    const credentialSelect = jest.fn().mockReturnValue({ eq });

    const legacyIn = jest.fn().mockResolvedValue({
      data: options?.legacySettings ?? [],
      error: options?.legacyError ?? null,
    });
    const legacySelect = jest.fn().mockReturnValue({ in: legacyIn });

    const from = jest.fn((table: string) => {
      if (table === 'scraper_credentials') {
        return { select: credentialSelect };
      }

      if (table === 'app_settings') {
        return { select: legacySelect };
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });

    mockCreateAdminClient.mockResolvedValue({ from });

    return { from, credentialSelect, eq, order, legacyIn };
  }

  it('returns credentials when stored as separate login/password rows', async () => {
    const login = encryptSecret('user@example.com', encryptionKey);
    const password = encryptSecret('super-secret', encryptionKey);
    mockCredentialRows([
      { ...login, credential_type: 'login' },
      { ...password, credential_type: 'password' },
    ]);

    const res = await GET(createRequest({ 'x-api-key': 'bsr_test' }), {
      params: Promise.resolve({ id: 'orgill' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      username: 'user@example.com',
      password: 'super-secret',
      type: 'basic',
    });
  });

  it('returns credentials when stored as legacy JSON payload', async () => {
    const legacy = encryptSecret(
      JSON.stringify({ username: 'legacy-user', password: 'legacy-pass', type: 'basic' }),
      encryptionKey
    );
    mockCredentialRows([{ ...legacy, credential_type: 'login' }]);

    const res = await GET(createRequest({ 'x-api-key': 'bsr_test' }), {
      params: Promise.resolve({ id: 'phillips' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      username: 'legacy-user',
      password: 'legacy-pass',
      type: 'basic',
    });
  });

  it('returns 404 when credentials cannot be assembled', async () => {
    const login = encryptSecret('only-user', encryptionKey);
    mockCredentialRows([{ ...login, credential_type: 'login' }]);

    const res = await GET(createRequest({ 'x-api-key': 'bsr_test' }), {
      params: Promise.resolve({ id: 'petfoodex' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('normalizes the route slug before allowlist checks and database lookup', async () => {
    const login = encryptSecret('user@example.com', encryptionKey);
    const password = encryptSecret('super-secret', encryptionKey);
    const { eq } = mockCredentialRows([
      { ...login, credential_type: 'login' },
      { ...password, credential_type: 'password' },
    ]);
    mockValidateRunnerAuth.mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
      allowedScrapers: ['orgill'],
    });

    const res = await GET(createRequest({ 'x-api-key': 'bsr_test' }), {
      params: Promise.resolve({ id: 'Orgill' }),
    });

    expect(eq).toHaveBeenCalledWith('scraper_slug', 'orgill');
    expect(res.status).toBe(200);
  });
});
