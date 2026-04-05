jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers;
    url: string;
    private readonly bodyText: string;

    constructor(input: string | Request | URL, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : 'http://localhost';
      this.headers = new Headers(init?.headers || {});
      this.bodyText = (init?.body as string) || '';
    }

    async json() {
      return this.bodyText ? JSON.parse(this.bodyText) : {};
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status || 200;
      return {
        status,
        json: async () => data,
        ...((data && typeof data === 'object') ? data : {}),
      };
    },
  },
}));

import { GET, POST } from '@/app/api/admin/flags/route';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
  getGeminiFeatureFlagAuditLog,
  getGeminiFeatureFlags,
  upsertGeminiFeatureFlags,
} from '@/lib/config/gemini-feature-flags';

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/config/gemini-feature-flags', () => ({
  getGeminiFeatureFlagAuditLog: jest.fn(),
  getGeminiFeatureFlags: jest.fn(),
  upsertGeminiFeatureFlags: jest.fn(),
}));

describe('admin Gemini flags route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      role: 'admin',
    });
    (getGeminiFeatureFlags as jest.Mock).mockResolvedValue({
      GEMINI_AI_SEARCH_ENABLED: false,
      GEMINI_CRAWL4AI_ENABLED: false,
      GEMINI_BATCH_ENABLED: true,
      GEMINI_PARALLEL_RUN_ENABLED: false,
      GEMINI_TRAFFIC_PERCENT: 25,
      GEMINI_PARALLEL_SAMPLE_PERCENT: 10,
    });
    (getGeminiFeatureFlagAuditLog as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        changed_keys: ['GEMINI_BATCH_ENABLED'],
      },
    ]);
    (upsertGeminiFeatureFlags as jest.Mock).mockResolvedValue({
      GEMINI_AI_SEARCH_ENABLED: true,
      GEMINI_CRAWL4AI_ENABLED: false,
      GEMINI_BATCH_ENABLED: true,
      GEMINI_PARALLEL_RUN_ENABLED: false,
      GEMINI_TRAFFIC_PERCENT: 50,
      GEMINI_PARALLEL_SAMPLE_PERCENT: 10,
    });
  });

  it('returns current flags and audit log', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.flags.GEMINI_BATCH_ENABLED).toBe(true);
    expect(body.auditLog).toHaveLength(1);
  });

  it('updates flags with audit metadata', async () => {
    const req = {
      json: async () => ({
        GEMINI_AI_SEARCH_ENABLED: true,
        GEMINI_TRAFFIC_PERCENT: 50,
        reason: 'rollout step',
        source: 'test',
      }),
    };

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(upsertGeminiFeatureFlags).toHaveBeenCalledWith(
      {
        GEMINI_AI_SEARCH_ENABLED: true,
        GEMINI_TRAFFIC_PERCENT: 50,
      },
      'admin-1',
      { reason: 'rollout step', source: 'test' }
    );
  });
});
