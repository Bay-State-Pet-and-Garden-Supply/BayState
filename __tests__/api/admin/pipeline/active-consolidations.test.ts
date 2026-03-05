jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    headers: Headers;
    url: string;

    constructor(input: string | Request | URL, init?: RequestInit) {
      this.url = typeof input === 'string' ? input : 'http://localhost';
      this.headers = new Headers(init?.headers || {});
    }
  },
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => {
      const status = init?.status || 200;
      return {
        status,
        json: async () => data,
      };
    },
  },
}));

jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { GET } from '@/app/api/admin/pipeline/active-consolidations/route';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';

describe('active-consolidations route', () => {
  let mockSupabase: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createClient>;
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it('returns 401 if not authenticated', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 401, json: async () => ({ error: 'Unauthorized' }) },
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 if user is not admin or staff', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 403, json: async () => ({ error: 'Forbidden' }) },
    });

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns active consolidation jobs with correct fields', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'admin',
    });

    const mockBatchJobs = [
      {
        id: 'batch-1',
        status: 'in_progress',
        total_requests: 100,
        completed_requests: 50,
        failed_requests: 5,
        created_at: '2026-01-15T10:00:00Z',
      },
      {
        id: 'batch-2',
        status: 'pending',
        total_requests: 200,
        completed_requests: 0,
        failed_requests: 0,
        created_at: '2026-01-16T10:00:00Z',
      },
      {
        id: 'batch-3',
        status: 'validating',
        total_requests: 50,
        completed_requests: 10,
        failed_requests: 2,
        created_at: '2026-01-17T10:00:00Z',
      },
    ];

    mockSupabase.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockBatchJobs, error: null }),
        }),
      }),
    }) as unknown as typeof mockSupabase.from;

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('consolidations');
    expect(Array.isArray(body.consolidations)).toBe(true);
    expect(body.consolidations.length).toBe(3);

    const first = body.consolidations[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('totalProducts');
    expect(first).toHaveProperty('processedCount');
    expect(first).toHaveProperty('successCount');
    expect(first).toHaveProperty('errorCount');
    expect(first).toHaveProperty('createdAt');
    expect(first).toHaveProperty('progress');

    expect(first.progress).toBe(55);
  });

  it('excludes completed, failed, and expired jobs', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'admin',
    });

    await GET();

    expect(mockSupabase.from).toHaveBeenCalledWith('batch_jobs');
  });

  it('returns empty array when no active jobs', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'admin',
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.consolidations).toEqual([]);
  });

  it('orders by created_at descending', async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'admin@test.com' },
      role: 'admin',
    });

    await GET();

    expect(mockSupabase.from).toHaveBeenCalledWith('batch_jobs');
  });
});
