/**
 * @jest-environment node
 */
import { bulkUpdateStatus, getProductsByStatus, getStatusCounts } from '@/lib/pipeline';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

function createThenableBuilder<T>(result: T) {
    return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        filter: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        then: jest.fn((resolve) => resolve(result)),
    };
}

describe('pipeline status transition CRUD', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('queries pipeline_status_new for new statuses', async () => {
        const queryBuilder = createThenableBuilder({ data: [], error: null, count: 0 });
        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn().mockReturnValue(queryBuilder),
        });

        await getProductsByStatus('registered');

        expect(queryBuilder.eq).toHaveBeenCalledWith('pipeline_status_new', 'registered');
        expect(queryBuilder.eq).not.toHaveBeenCalledWith('pipeline_status', 'registered');
    });

    it('keeps querying pipeline_status for legacy statuses', async () => {
        const queryBuilder = createThenableBuilder({ data: [], error: null, count: 0 });
        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn().mockReturnValue(queryBuilder),
        });

        await getProductsByStatus('staging');

        expect(queryBuilder.eq).toHaveBeenCalledWith('pipeline_status', 'staging');
        expect(queryBuilder.eq).not.toHaveBeenCalledWith('pipeline_status_new', 'staging');
    });

    it('returns counts for new statuses with legacy fallback mapping', async () => {
        const select = jest.fn().mockResolvedValue({
            data: [
                { pipeline_status_new: 'registered', pipeline_status: 'staging' },
                { pipeline_status_new: 'enriched', pipeline_status: 'scraped' },
                { pipeline_status_new: 'finalized', pipeline_status: 'consolidated' },
                { pipeline_status_new: null, pipeline_status: 'approved' },
                { pipeline_status_new: null, pipeline_status: 'failed' },
            ],
            error: null,
        });

        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn().mockReturnValue({ select }),
        });

        const counts = await getStatusCounts();

        expect(select).toHaveBeenCalledWith('pipeline_status, pipeline_status_new');
        expect(counts).toEqual([
            { status: 'registered', count: 2 },
            { status: 'enriched', count: 1 },
            { status: 'finalized', count: 2 },
        ]);
    });

    it('blocks invalid bulk transitions before updating', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'consolidated', pipeline_status_new: 'finalized' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'registered');

        expect(result).toEqual({
            success: false,
            error: 'Invalid status transition to registered for SKU(s): SKU-1',
            updatedCount: 0,
        });
        expect(updateBuilder.update).not.toHaveBeenCalled();
    });

    it('dual-writes legacy and new statuses for valid bulk transitions', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'staging', pipeline_status_new: 'registered' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'enriched', 'user-1');

        expect(result).toEqual({ success: true, updatedCount: 1 });
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'scraped',
                pipeline_status_new: 'enriched',
            })
        );
        expect(auditBuilder.insert).toHaveBeenCalledWith([
            expect.objectContaining({
                to_state: 'enriched',
                actor_id: 'user-1',
                metadata: expect.objectContaining({
                    legacy_status_written: 'scraped',
                    new_status_written: 'enriched',
                }),
            }),
        ]);
    });
});
