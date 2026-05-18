import {
  startMigrationLog,
  completeMigrationLog,
  getRecentMigrationLogs,
} from '@/lib/admin/migration/history';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('Migration History', () => {
  let mockSupabase: {
    from: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    select: jest.Mock;
    eq: jest.Mock;
    order: jest.Mock;
    limit: jest.Mock;
    single: jest.Mock;
  };

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      single: jest.fn(),
    };

    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it('should start a migration sync run', async () => {
    mockSupabase.single.mockResolvedValue({ data: { id: 'test-uuid' }, error: null });

    const logId = await startMigrationLog('products');

    expect(mockSupabase.from).toHaveBeenCalledWith('integration_sync_runs');
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: 'shopsite',
        source_system: 'shopsite_15',
        sync_kind: 'products',
        status: 'running',
      }),
    );
    expect(logId).toBe('test-uuid');
  });

  it('should complete a migration sync run', async () => {
    mockSupabase.eq.mockResolvedValue({ data: null, error: null });

    await completeMigrationLog('test-uuid', {
      success: true,
      processed: 10,
      created: 5,
      updated: 5,
      failed: 0,
      errors: [],
      duration: 1000,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('integration_sync_runs');
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        row_count: 10,
        inserted_count: 5,
        updated_count: 5,
        error_count: 0,
        metadata: expect.objectContaining({
          legacy_adapter: 'migration_log',
          errors: [],
        }),
      }),
    );
    expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'test-uuid');
  });

  it('should get recent migration logs from integration_sync_runs', async () => {
    const mockRuns = [
      {
        id: '1',
        source_type: 'shopsite',
        source_system: 'shopsite_15',
        sync_kind: 'products',
        status: 'completed',
        row_count: 12,
        inserted_count: 7,
        updated_count: 5,
        error_count: 0,
        started_at: '2026-05-18T00:00:00.000Z',
        completed_at: '2026-05-18T00:01:00.000Z',
        error_summary: null,
        metadata: { errors: [] },
      },
      {
        id: '2',
        source_type: 'integra',
        source_system: 'integra_register',
        sync_kind: 'inventory',
        status: 'partial',
        row_count: 8,
        inserted_count: 0,
        updated_count: 8,
        error_count: 1,
        started_at: '2026-05-17T00:00:00.000Z',
        completed_at: '2026-05-17T00:01:30.000Z',
        error_summary: 'One row failed',
        metadata: {
          errors: [
            {
              record: 'SKU-1',
              error: 'One row failed',
              timestamp: '2026-05-17T00:01:00.000Z',
            },
          ],
        },
      },
    ];

    mockSupabase.limit.mockResolvedValue({ data: mockRuns, error: null });

    const logs = await getRecentMigrationLogs(5);

    expect(mockSupabase.from).toHaveBeenCalledWith('integration_sync_runs');
    expect(mockSupabase.order).toHaveBeenCalledWith('started_at', { ascending: false });
    expect(mockSupabase.limit).toHaveBeenCalledWith(5);
    expect(logs).toEqual([
      expect.objectContaining({
        id: '1',
        sync_type: 'products',
        status: 'completed',
        processed: 12,
        created: 7,
        updated: 5,
        failed: 0,
      }),
      expect.objectContaining({
        id: '2',
        sync_type: 'integra:inventory',
        status: 'partial',
        processed: 8,
        created: 0,
        updated: 8,
        failed: 1,
      }),
    ]);
  });
});
