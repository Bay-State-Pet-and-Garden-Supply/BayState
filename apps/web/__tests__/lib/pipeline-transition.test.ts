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
                { pipeline_status: 'scraping' },
                { pipeline_status: 'scraped' },
                { pipeline_status: 'consolidating' },
                { pipeline_status: 'finalizing' },
                { pipeline_status: 'exporting' },
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
            { status: 'scraping', count: 1 },
            { status: 'scraped', count: 1 },
            { status: 'consolidating', count: 1 },
            { status: 'finalizing', count: 1 },
            { status: 'exporting', count: 1 },
            { status: 'failed', count: 2 },
        ]);
    });

    it('blocks invalid bulk transitions before updating', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'finalizing' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'imported');

        expect(result).toEqual({
            success: false,
            error: "Invalid status transition to 'imported'. Allowed persisted statuses: 'imported', 'scraping', 'scraped', 'consolidating', 'finalizing', 'exporting', 'failed' SKU(s): SKU-1",
            updatedCount: 0,
        });
        expect(updateBuilder.update).not.toHaveBeenCalled();
    });

    it('allows valid bulk transitions and logs to audit', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'imported' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'scraping', 'user-1');

        expect(result).toEqual({ success: true, updatedCount: 1 });
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'scraping',
                exported_at: null,
            })
        );
        expect(auditBuilder.insert).toHaveBeenCalledWith([
            expect.objectContaining({
                to_state: 'scraping',
                actor_id: 'user-1',
            }),
        ]);
    });

    it('allows review rejection transitions for correction', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'finalizing' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'scraped');

        expect(result.success).toBe(true);
        expect(auditBuilder.insert).toHaveBeenCalledWith([
            expect.objectContaining({
                to_state: 'scraped',
            }),
        ]);
    });

    it('clears finalizing-only artifacts when rejecting back to scraped with resetResults', async () => {
        const fetchBuilder = {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
                data: [{ sku: 'SKU-1', pipeline_status: 'finalizing' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'scraped', 'user-1', true);

        expect(result).toEqual({ success: true, updatedCount: 1 });
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                pipeline_status: 'scraped',
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
                data: [{ sku: 'SKU-1', pipeline_status: 'failed' }],
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

        const result = await bulkUpdateStatus(['SKU-1'], 'imported');

        expect(result.success).toBe(true);
        expect(updateBuilder.update).toHaveBeenCalledWith(
            expect.objectContaining({ pipeline_status: 'imported', exported_at: null })
        );
    });
});
