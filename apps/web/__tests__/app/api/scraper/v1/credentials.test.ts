/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status ?? 200,
      json: async () => data,
      ...((data && typeof data === 'object') ? data : {}),
    }),
  },
}));

import crypto from 'crypto';

import { GET } from '@/app/api/scraper/v1/credentials/[id]/route';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createAdminClient } from '@/lib/supabase/server';

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

function encryptSecret(secret: string, key: Buffer) {
  const iv = Buffer.alloc(12, 7);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted_value: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

describe('GET /api/scraper/v1/credentials/[id]', () => {
  const encryptionKey = '12345678901234567890123456789012';
  let mockSupabase: {
    from: jest.Mock;
    select: jest.Mock;
    eq: jest.Mock;
    order: jest.Mock;
  };

  beforeEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = encryptionKey;
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  const createRequest = (headers: Record<string, string> = {}) => {
    const requestHeaders = new Map(Object.entries(headers));
    return {
      headers: {
        get: (key: string) => requestHeaders.get(key) || null,
      },
    } as unknown as Request;
  };

  it('returns 401 when runner auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const res = await GET(createRequest(), { params: Promise.resolve({ id: 'phillips' }) });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('reconstructs username/password from separate encrypted credential rows', async () => {
    const key = Buffer.from(encryptionKey, 'utf8');
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
      allowedScrapers: null,
    });

    mockSupabase.order.mockResolvedValue({
      data: [
        {
          ...encryptSecret('local-user@example.com', key),
          credential_type: 'login',
        },
        {
          ...encryptSecret('super-secret-password', key),
          credential_type: 'password',
        },
      ],
      error: null,
    });

    const res = await GET(
      createRequest({ 'x-api-key': 'bsr_test_key' }),
      { params: Promise.resolve({ id: 'phillips' }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      username: 'local-user@example.com',
      password: 'super-secret-password',
      type: 'basic',
    });
  });

  it('supports legacy JSON credential payloads', async () => {
    const key = Buffer.from(encryptionKey, 'utf8');
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
      allowedScrapers: null,
    });

    mockSupabase.order.mockResolvedValue({
      data: [
        {
          ...encryptSecret(JSON.stringify({
            username: 'legacy-user',
            password: 'legacy-password',
            type: 'basic',
          }), key),
          credential_type: 'login',
        },
      ],
      error: null,
    });

    const res = await GET(
      createRequest({ 'x-api-key': 'bsr_test_key' }),
      { params: Promise.resolve({ id: 'orgill' }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      username: 'legacy-user',
      password: 'legacy-password',
      type: 'basic',
    });
  });

  it('normalizes scraper slugs and trims the encryption key during decryption', async () => {
    const key = Buffer.from(encryptionKey, 'utf8');
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = `${encryptionKey} \n`;
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
      allowedScrapers: ['orgill'],
    });

    mockSupabase.order.mockResolvedValue({
      data: [
        {
          ...encryptSecret('normalized-user@example.com', key),
          credential_type: 'login',
        },
        {
          ...encryptSecret('normalized-secret', key),
          credential_type: 'password',
        },
      ],
      error: null,
    });

    const res = await GET(
      createRequest({ 'x-api-key': 'bsr_test_key' }),
      { params: Promise.resolve({ id: 'Orgill ' }) }
    );

    expect(mockSupabase.eq).toHaveBeenCalledWith('scraper_slug', 'orgill');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      username: 'normalized-user@example.com',
      password: 'normalized-secret',
      type: 'basic',
    });
  });
});
