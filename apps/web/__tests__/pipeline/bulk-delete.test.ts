import { bulkDeleteProducts } from '@/lib/pipeline';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

describe('Bulk Delete Functionality', () => {
    let mockSupabase: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock chains for different operations
        const mockDeleteChain = {
            delete: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 3 }),
        };

        const mockInsertChain = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
        
        mockSupabase = {
            from: jest.fn().mockImplementation((table: string) => {
                if (table === 'products_ingestion') {
                    return mockDeleteChain;
                } else if (table === 'pipeline_audit_log') {
                    return mockInsertChain;
                }
                return {
                    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
                };
            }),
        };

        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    describe('bulkDeleteProducts', () => {
        it('should successfully delete products and log to audit_log', async () => {
            const skus = ['SKU001', 'SKU002', 'SKU003'];
            const userId = 'test-user-id';

            // Get the mock chains from beforeEach
            const deleteChain = mockSupabase.from('products_ingestion');
            const insertChain = mockSupabase.from('pipeline_audit_log');

            // Mock successful deletion
            deleteChain.in.mockResolvedValue({
                data: null,
                error: null,
                count: 3,
            });

            // Mock successful audit log insert
            insertChain.insert.mockResolvedValue({
                data: null,
                error: null,
            });

            const result = await bulkDeleteProducts(skus, userId);

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(3);
            expect(mockSupabase.from).toHaveBeenCalledWith('products_ingestion');
            expect(deleteChain.delete).toHaveBeenCalled();
            expect(deleteChain.in).toHaveBeenCalledWith('sku', skus);
        });

        it('should return error when deletion fails', async () => {
            const skus = ['SKU001', 'SKU002'];
            const userId = 'test-user-id';
            const deleteError = new Error('Database connection failed');

            // Get the mock chain
            const deleteChain = mockSupabase.from('products_ingestion');

            // Mock failed deletion
            deleteChain.in.mockResolvedValue({
                data: null,
                error: deleteError,
                count: 0,
            });

            const result = await bulkDeleteProducts(skus, userId);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.deletedCount).toBe(0);
            expect(deleteChain.in).toHaveBeenCalledWith('sku', skus);
        });

        it('should log deletion to audit_log with correct metadata', async () => {
            const skus = ['SKU001', 'SKU002'];
            const userId = 'test-user-id';

            // Get the mock chains
            const deleteChain = mockSupabase.from('products_ingestion');
            const insertChain = mockSupabase.from('pipeline_audit_log');

            // Mock successful operations
            deleteChain.in.mockResolvedValue({
                data: null,
                error: null,
                count: 2,
            });

            insertChain.insert.mockResolvedValue({
                data: null,
                error: null,
            });

            await bulkDeleteProducts(skus, userId);

            // Verify audit log insert was called
            expect(insertChain.insert).toHaveBeenCalled();
            const insertCall = insertChain.insert.mock.calls[0][0];
            const auditPayload = insertCall[0];
            
            expect(auditPayload.job_type).toBe('product_deletion');
            expect(auditPayload.to_state).toBe('deleted');
            expect(auditPayload.metadata.deleted_skus).toEqual(skus);
            expect(auditPayload.metadata.deleted_count).toBe(2);
        });

        it('should continue deletion even if audit log fails', async () => {
            const skus = ['SKU001', 'SKU002'];
            const userId = 'test-user-id';

            // Get the mock chains
            const deleteChain = mockSupabase.from('products_ingestion');
            const insertChain = mockSupabase.from('pipeline_audit_log');

            // Mock successful deletion but failed audit log
            deleteChain.in.mockResolvedValue({
                data: null,
                error: null,
                count: 2,
            });

            // Mock failed audit log (non-fatal error)
            insertChain.insert.mockResolvedValue({
                data: null,
                error: new Error('Audit log unavailable'),
            });

            const result = await bulkDeleteProducts(skus, userId);

            // Deletion should still succeed
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(2);
        });

        it('should set actor_type to system when no userId provided', async () => {
            const skus = ['SKU001'];

            // Get the mock chains
            const deleteChain = mockSupabase.from('products_ingestion');
            const insertChain = mockSupabase.from('pipeline_audit_log');

            // Mock successful operations
            deleteChain.in.mockResolvedValue({
                data: null,
                error: null,
                count: 1,
            });

            insertChain.insert.mockResolvedValue({
                data: null,
                error: null,
            });

            await bulkDeleteProducts(skus);

            const insertCall = insertChain.insert.mock.calls[0][0];
            const auditPayload = insertCall[0];
            expect(auditPayload.actor_type).toBe('system');
            expect(auditPayload.actor_id).toBeNull();
        });

        it('should set actor_type to user when userId provided', async () => {
            const skus = ['SKU001'];
            const userId = 'admin-user-123';

            // Get the mock chains
            const deleteChain = mockSupabase.from('products_ingestion');
            const insertChain = mockSupabase.from('pipeline_audit_log');

            // Mock successful operations
            deleteChain.in.mockResolvedValue({
                data: null,
                error: null,
                count: 1,
            });

            insertChain.insert.mockResolvedValue({
                data: null,
                error: null,
            });

            await bulkDeleteProducts(skus, userId);

            const insertCall = insertChain.insert.mock.calls[0][0];
            const auditPayload = insertCall[0];
            expect(auditPayload.actor_type).toBe('user');
            expect(auditPayload.actor_id).toBe(userId);
        });
    });
});
