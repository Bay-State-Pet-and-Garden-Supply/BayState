/**
 * @jest-environment node
 */
import { POST, GET } from '@/app/api/admin/scraper-network/runners/register/route';
import { validateActiveRunner } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

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
    validateActiveRunner: jest.fn(),
  };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('Runner Registration API', () => {
  const mockValidateActiveRunner = validateActiveRunner as jest.Mock;
  const mockCreateClient = createClient as jest.Mock;

  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          name: 'test-runner',
          status: 'online',
          metadata: {
            registered_at: '2026-05-19T00:00:00Z',
          },
        },
        error: null,
      }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
  });

  function createRequest(body: any = {}, headers: Record<string, string> = {}) {
    const requestHeaders = new Map(Object.entries(headers));
    return {
      headers: {
        get: (key: string) => requestHeaders.get(key) || null,
      },
      json: async () => body,
    } as unknown as Request;
  }

  describe('POST /api/admin/scraper-network/runners/register', () => {
    it('returns 401 when runner auth fails', async () => {
      mockValidateActiveRunner.mockResolvedValue({
        isAuthenticated: false,
        isEnabled: false,
      });

      const res = await POST(createRequest({ runner_name: 'test-runner' }) as any);
      expect(res.status).toBe(401);
    });

    it('returns 403 when runner is disabled', async () => {
      mockValidateActiveRunner.mockResolvedValue({
        isAuthenticated: true,
        isEnabled: false,
      });

      const res = await POST(createRequest({ runner_name: 'test-runner' }) as any);
      expect(res.status).toBe(403);
    });

    it('returns 403 when body name does not match authenticated key name (spoofing check)', async () => {
      mockValidateActiveRunner.mockResolvedValue({
        isAuthenticated: true,
        isEnabled: true,
        runner: {
          runnerName: 'runner-A',
          authMethod: 'api_key',
        },
      });

      const res = await POST(createRequest({ runner_name: 'runner-B' }) as any);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('runner_name does not match authenticated runner name');
    });

    it('returns 200 and registers the runner when names match', async () => {
      mockValidateActiveRunner.mockResolvedValue({
        isAuthenticated: true,
        isEnabled: true,
        runner: {
          runnerName: 'test-runner',
          authMethod: 'api_key',
        },
      });

      const res = await POST(createRequest({ runner_name: 'test-runner' }) as any);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.runner.name).toBe('test-runner');
      expect(mockSupabase.from).toHaveBeenCalledWith('scraper_runners');
    });
  });

  describe('GET /api/admin/scraper-network/runners/register', () => {
    it('returns valid: true when auth succeeds', async () => {
      mockValidateActiveRunner.mockResolvedValue({
        isAuthenticated: true,
        isEnabled: true,
        runner: {
          runnerName: 'test-runner',
          authMethod: 'api_key',
        },
      });

      const res = await GET(createRequest() as any);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.runner_name).toBe('test-runner');
    });
  });
});
