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

jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));

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

  it('returns credentials when stored as separate login/password rows', async () => {
    const login = encryptSecret('user@example.com', encryptionKey);
    const password = encryptSecret('super-secret', encryptionKey);
    const mockEq = jest.fn().mockResolvedValue({
      data: [
        { ...login, credential_type: 'login' },
        { ...password, credential_type: 'password' },
      ],
      error: null,
    });

    mockCreateAdminClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: mockEq,
        }),
      }),
    });

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
    const mockEq = jest.fn().mockResolvedValue({
      data: [{ ...legacy, credential_type: 'login' }],
      error: null,
    });

    mockCreateAdminClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: mockEq,
        }),
      }),
    });

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
    const mockEq = jest.fn().mockResolvedValue({
      data: [{ ...login, credential_type: 'login' }],
      error: null,
    });

    mockCreateAdminClient.mockResolvedValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: mockEq,
        }),
      }),
    });

    const res = await GET(createRequest({ 'x-api-key': 'bsr_test' }), {
      params: Promise.resolve({ id: 'petfoodex' }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Not found' });
  });
});
