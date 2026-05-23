/**
 * @jest-environment node
 */
import { bulkUpdateStatus, getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

function createThenableBuilder<T>(result: T) {
    const builder = Promise.resolve(result) as Promise<T> & Record<string, jest.Mock>;
    builder.select = jest.fn().mockReturnValue(builder);
    builder.eq = jest.fn().mockReturnValue(builder);
    builder.is = jest.fn().mockReturnValue(builder);
    builder.or = jest.fn().mockReturnValue(builder);
    builder.gte = jest.fn().mockReturnValue(builder);
    builder.lte = jest.fn().mockReturnValue(builder);
    builder.filter = jest.fn().mockReturnValue(builder);
    builder.order = jest.fn().mockReturnValue(builder);
    builder.limit = jest.fn().mockReturnValue(builder);
    builder.range = jest.fn().mockReturnValue(builder);
    builder.in = jest.fn().mockReturnValue(builder);
    builder.update = jest.fn().mockReturnValue(builder);

    return builder;
}

describe('pipeline status transition CRUD', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('queries products by pipeline_status', async () => {
        const queryBuilder = createThenableBuilder({ data: [], error: null, count: 0 });
        (createClient as jest.Mock).mockResolvedValue({
            rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
            from: jest.fn().mockReturnValue(queryBuilder),
        });

        await getProductsByStatus('imported');

        expect(queryBuilder.eq).toHaveBeenCalledWith('pipeline_status', 'imported');
        expect(queryBuilder.is).toHaveBeenCalledWith('exported_at', null);
    });

    it('returns counts for all pipeline status buckets', async () => {
        const queryBuilder = createThenableBuilder({
            data: [
                { pipeline_status: 'imported' },
                { pipeline_status: 'imported' },
                { pipeline_status: 'extracting' },
                { pipeline_status: 'processed' },
                { pipeline_status: 'merging' },
                { pipeline_status: 'reviewing' },
                { pipeline_status: 'publishing' },
                { pipeline_status: 'failed' },
                { pipeline_status: 'failed' },
            ],
            error: null,
        });

        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn().mockReturnValue(queryBuilder),
        });

        const counts = await getStatusCounts();

        expect(queryBuilder.select).toHaveBeenCalledWith('pipeline_status');
        expect(queryBuilder.is).toHaveBeenCalledWith('exported_at', null);
        expect(counts).toEqual([
            { status: 'imported', count: 2 },
            { status: 'awaiting_brand', count: 0 },
            { status: 'extracting', count: 1 },
            { status: 'processed', count: 1 },
            { status: 'merging', count: 1 },
            { status: 'reviewing', count: 1 },
            { status: 'publishing', count: 1 },
            { status: 'failed', count: 2 },
        ]);
    });

    it('blocks invalid bulk transitions before updating', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'reviewing' }],
                error: null,
            }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn(),
        };

        const from = jest
            .fn()
            .mockReturnValueOnce(fetchBuilder)
            .mockReturnValueOnce(updateBuilder);

        (createClient as jest.Mock).mockResolvedValue({ from });

        const result = await bulkUpdateStatus(['UPC-1'], 'imported');

        expect(result).toEqual({
            success: false,
            error: "Invalid status transition to 'imported'. Allowed persisted statuses: 'imported', 'awaiting_brand', 'extracting', 'processed', 'merging', 'reviewing', 'publishing', 'failed' UPC(s): UPC-1",
            updatedCount: 0,
        });
        expect(updateBuilder.update).not.toHaveBeenCalled();
    });

    it('allows valid bulk transitions and logs to audit', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'imported' }],
                error: null,
            }),
        };

        const deleteBuilder = {
            delete: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ error: null }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
        };

        const auditBuilder = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };

        const from = jest
            .fn()
            .mockReturnValueOnce(fetchBuilder)
            .mockReturnValueOnce(deleteBuilder)
            .mockReturnValueOnce(updateBuilder)
            .mockReturnValueOnce(auditBuilder);

        (createClient as jest.Mock).mockResolvedValue({ from });

        const result = await bulkUpdateStatus(['UPC-1'], 'imported', 'user-1');

        expect(result).toEqual({ success: true, updatedCount: 1 });
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'imported',
                exported_at: null,
            })
        );
        expect(auditBuilder.insert).toHaveBeenCalledWith([
            expect.objectContaining({
                to_state: 'imported',
                actor_id: 'user-1',
            }),
        ]);
    });

    it('allows review rejection transitions for correction', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'reviewing' }],
                error: null,
            }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
        };

        const auditBuilder = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };

        const from = jest
            .fn()
            .mockReturnValueOnce(fetchBuilder)
            .mockReturnValueOnce(updateBuilder)
            .mockReturnValueOnce(auditBuilder);

        (createClient as jest.Mock).mockResolvedValue({ from });

        const result = await bulkUpdateStatus(['UPC-1'], 'processed');

        expect(result.success).toBe(true);
        expect(auditBuilder.insert).toHaveBeenCalledWith([
            expect.objectContaining({
                to_state: 'processed',
            }),
        ]);
    });

    it('clears reviewing-only artifacts when rejecting back to processed with resetResults', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'reviewing' }],
                error: null,
            }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
        };

        const auditBuilder = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };

        const from = jest
            .fn()
            .mockReturnValueOnce(fetchBuilder)
            .mockReturnValueOnce(updateBuilder)
            .mockReturnValueOnce(auditBuilder);

        (createClient as jest.Mock).mockResolvedValue({ from });

        const result = await bulkUpdateStatus(['UPC-1'], 'processed', 'user-1', true);

        expect(result).toEqual({ success: true, updatedCount: 1 });
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'processed',
                consolidated: null,
                image_candidates: [],
                selected_images: [],
                confidence_score: null,
                error_message: null,
                retry_count: 0,
                exported_at: null,
            })
        );
    });

    it('allows failed products to be retried back to imported', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'failed' }],
                error: null,
            }),
        };

        const deleteBuilder = {
            delete: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ error: null }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
        };

        const auditBuilder = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };

        const from = jest
            .fn()
            .mockReturnValueOnce(fetchBuilder)
            .mockReturnValueOnce(deleteBuilder)
            .mockReturnValueOnce(updateBuilder)
            .mockReturnValueOnce(auditBuilder);

        (createClient as jest.Mock).mockResolvedValue({ from });

        const result = await bulkUpdateStatus(['UPC-1'], 'imported');

        expect(result.success).toBe(true);
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({ pipeline_status: 'imported', exported_at: null })
        );
    });

    it('always clears results when transitioning to imported, regardless of resetResults', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ upc: 'UPC-1', pipeline_status: 'failed' }],
                error: null,
            }),
        };

        const updateBuilder = {
            update: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: null, error: null, count: 1 }),
        };

        const deleteBuilder = {
            delete: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ error: null }),
        };

        const auditBuilder = {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };

        const from = jest
            .fn()
            .mockImplementation((table) => {
                if (table === 'products_ingestion') {
                    // This is a bit tricky since products_ingestion is used for both fetch and update
                    // We can return the builders in sequence or check the call
                    return fetchBuilder.in.mock.calls.length === 0 ? fetchBuilder : updateBuilder;
                }
                if (table === 'enrichment_targets') return deleteBuilder;
                if (table === 'pipeline_audit_log') return auditBuilder;
                return { select: jest.fn().mockReturnThis(), in: jest.fn() };
            });

        (createClient as jest.Mock).mockResolvedValue({ from });

        // Call WITHOUT resetResults (it defaults to false)
        await bulkUpdateStatus(['UPC-1'], 'imported');

        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'imported',
                sources: {},
                consolidated: null,
                confidence_score: null,
                error_message: null,
                retry_count: 0
            })
        );
        expect(deleteBuilder.delete).toHaveBeenCalled(); // Should clear enrichment_targets
    });
});
