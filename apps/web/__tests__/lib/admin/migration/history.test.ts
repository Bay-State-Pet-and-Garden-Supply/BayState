import { startMigrationLog, completeMigrationLog, getRecentMigrationLogs } from '@/lib/admin/migration/history';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

describe('Migration History', () => {
    let mockSupabase: any;

    beforeEach(() => {
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn(),
        };
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('should start a migration log', async () => {
        mockSupabase.single.mockResolvedValue({ data: { id: 'test-uuid' }, error: null });

        const logId = await startMigrationLog('products');

        expect(mockSupabase.from).toHaveBeenCalledWith('migration_log');
        expect(mockSupabase.insert).toHaveBeenCalledWith({
            sync_type: 'products',
            status: 'running',
        });
        expect(logId).toBe('test-uuid');
    });

    it('should complete a migration log', async () => {
        mockSupabase.single.mockResolvedValue({ data: null, error: null });

        await completeMigrationLog('test-uuid', {
            success: true,
            processed: 10,
            created: 5,
            updated: 5,
            failed: 0,
            errors: [],
            duration: 1000,
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('migration_log');
        expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            processed: 10,
            created: 5,
            updated: 5,
            failed: 0,
            duration_ms: 1000,
        }));
        expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'test-uuid');
    });

    it('should get recent migration logs', async () => {
        const mockLogs = [
            { id: '1', sync_type: 'products', status: 'completed', errors: [] },
            { id: '2', sync_type: 'orders', status: 'failed', errors: [] },
        ];
        mockSupabase.limit.mockResolvedValue({ data: mockLogs, error: null });

        const logs = await getRecentMigrationLogs(5);

        expect(mockSupabase.from).toHaveBeenCalledWith('migration_log');
        expect(mockSupabase.order).toHaveBeenCalledWith('started_at', { ascending: false });
        expect(mockSupabase.limit).toHaveBeenCalledWith(5);
        expect(logs).toEqual(mockLogs);
    });
});
