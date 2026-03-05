/**
 * @jest-environment node
 */
import { getProductsByStatus } from '@/lib/pipeline';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

describe('getProductsByStatus source filter', () => {
    let mockSupabase: any;

    const makeSupabaseMock = () => {
        const queryBuilder = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            filter: jest.fn().mockReturnThis(),
            contains: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            range: jest.fn().mockReturnThis(),
            then: jest.fn((resolve) => resolve({ data: [], error: null })),
        };

        return {
            from: jest.fn().mockReturnValue(queryBuilder),
            _queryBuilder: queryBuilder,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockSupabase = makeSupabaseMock();
        (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it('uses filter with ? operator for source key existence', async () => {
        await getProductsByStatus('staging', { source: 'amazon' });

        expect(mockSupabase._queryBuilder.filter).toHaveBeenCalledWith(
            'sources',
            '?',
            'amazon'
        );
    });

    it('uses filter for source when source is provided', async () => {
        await getProductsByStatus('scraped', { source: 'ebay' });

        expect(mockSupabase._queryBuilder.filter).toHaveBeenCalledTimes(1);
        expect(mockSupabase._queryBuilder.filter).toHaveBeenCalledWith(
            'sources',
            '?',
            'ebay'
        );
    });

    it('does not use filter when source is not provided', async () => {
        await getProductsByStatus('staging', {});

        expect(mockSupabase._queryBuilder.filter).not.toHaveBeenCalled();
    });

    it('handles source filter with various source names', async () => {
        const sources = ['amazon', 'ebay', 'walmart', 'petco', 'petsmart'];

        for (const source of sources) {
            const mock = makeSupabaseMock();
            (createClient as jest.Mock).mockResolvedValue(mock);
            await getProductsByStatus('staging', { source });
            expect(mock._queryBuilder.filter).toHaveBeenCalledWith(
                'sources',
                '?',
                source
            );
        }
    });

    it('combines source filter with other filters', async () => {
        await getProductsByStatus('staging', {
            source: 'amazon',
            minConfidence: 0.8,
            maxConfidence: 1.0,
            limit: 10,
        });

        expect(mockSupabase._queryBuilder.filter).toHaveBeenCalledWith(
            'sources',
            '?',
            'amazon'
        );
        expect(mockSupabase._queryBuilder.gte).toHaveBeenCalledWith(
            'confidence_score',
            0.8
        );
        expect(mockSupabase._queryBuilder.lte).toHaveBeenCalledWith(
            'confidence_score',
            1.0
        );
        expect(mockSupabase._queryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('works with date range filters combined with source', async () => {
        await getProductsByStatus('consolidated', {
            source: 'scraper-v2',
            startDate: '2024-01-01',
            endDate: '2024-12-31',
        });

        expect(mockSupabase._queryBuilder.filter).toHaveBeenCalledWith(
            'sources',
            '?',
            'scraper-v2'
        );
        expect(mockSupabase._queryBuilder.gte).toHaveBeenCalledWith(
            'updated_at',
            '2024-01-01'
        );
        expect(mockSupabase._queryBuilder.lte).toHaveBeenCalledWith(
            'updated_at',
            '2024-12-31'
        );
    });
});
