/**
 * @jest-environment node
 */
import { POST, GET, DELETE } from '@/app/api/admin/runners/accounts/route';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { generateAPIKey } from '@/lib/scraper-auth';
import { NextRequest } from 'next/server';

jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => ({
    url,
    ...init,
    json: async () => init?.body ? JSON.parse(init.body) : {},
  })),
  NextResponse: {
    json: (data: any, init?: ResponseInit) => ({
      status: init?.status || 200,
      json: async () => data,
      ...data,
    }),
  },
}));

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/scraper-auth', () => ({
  generateAPIKey: jest.fn(),
}));

describe('Runner Accounts API', () => {
  const mockRequireAdminAuth = requireAdminAuth as jest.Mock;
  const mockCreateClient = createClient as jest.Mock;
  const mockGenerateAPIKey = generateAPIKey as jest.Mock;

  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };

    mockCreateClient.mockResolvedValue(mockSupabase);
    mockRequireAdminAuth.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-id', email: 'admin@example.com' },
      role: 'admin',
    });
  });

  function createRequest(url: string, body: any = {}, method: string = 'POST') {
    return {
      url,
      method,
      json: async () => body,
    } as unknown as NextRequest;
  }

  describe('POST /api/admin/runners/accounts', () => {
    it('creates a new runner and API key', async () => {
      mockSupabase.single.mockImplementation(async () => {
          // First call: check if runner exists (return null)
          // Second call: return inserted key id
          if (mockSupabase.select.mock.calls.length === 1) {
              return { data: null, error: null };
          }
          return { data: { id: 'new-key-id' }, error: null };
      });
      
    mockSupabase.insert.mockReturnThis();
    mockGenerateAPIKey.mockReturnValue({
          key: 'bsr_testkey',
          hash: 'testhash',
          prefix: 'bsr_test',
      });

      const req = createRequest('http://localhost/api/admin/runners/accounts', {
        runner_name: 'test-runner',
        description: 'Test Key'
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.api_key).toBe('bsr_testkey');
      expect(data.runner_name).toBe('test-runner');
      
      // Verify client was used
      expect(mockCreateClient).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('scraper_runners');
      expect(mockSupabase.from).toHaveBeenCalledWith('runner_api_keys');
    });

    it('returns 400 for invalid runner_name', async () => {
      const req = createRequest('http://localhost/api/admin/runners/accounts', {
        runner_name: 'ab' // Too short
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('runner_name must be 3-50 characters');
    });
  });

  describe('GET /api/admin/runners/accounts', () => {
    it('lists runners and their keys', async () => {
      mockSupabase.order.mockResolvedValueOnce({
        data: [{ name: 'test-runner', status: 'offline' }],
        error: null
      });
      
      mockSupabase.order.mockResolvedValueOnce({
          data: [{ id: 'key-1', key_prefix: 'bsr_abc' }],
          error: null
      });

      const req = createRequest('http://localhost/api/admin/runners/accounts', {}, 'GET');
      const res = await GET(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.runners).toHaveLength(1);
      expect(data.runners[0].name).toBe('test-runner');
      expect(data.runners[0].api_keys).toHaveLength(1);
    });
  });
});
