import { createAdminClient } from '@/lib/supabase/server';
import { deduplicateProductLines } from '@/lib/consolidation/product-line-dedup';
import { upsertProductLine } from '@/lib/consolidation/product-lines';

// Mock Supabase Server Admin Client simply at the top to avoid TDZ/hoisting issues
jest.mock('@/lib/supabase/server', () => ({
    createAdminClient: jest.fn(),
}));

// Mock upsertProductLine from product-lines
jest.mock('@/lib/consolidation/product-lines', () => {
    const original = jest.requireActual('@/lib/consolidation/product-lines') as any;
    return {
        ...original,
        upsertProductLine: jest.fn(),
    };
});

describe('product-line-dedup', () => {
    let mockSupabase: any;
    let mockDbLines: any[] = [];
    let mockOr: any;
    let mockSelect: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDbLines = [];
        
        mockOr = jest.fn().mockReturnThis();
        mockSelect = jest.fn().mockReturnThis();

        const mockQueryBuilder: any = {
            or: mockOr,
            select: mockSelect,
        };

        // Make it thenable to act like a promise resolving the database query
        mockQueryBuilder.then = function(onfulfilled: any) {
            return Promise.resolve({ data: mockDbLines, error: null }).then(onfulfilled);
        };

        mockSupabase = {
            from: jest.fn().mockReturnValue(mockQueryBuilder),
        };

        // Set the mock implementation dynamically
        (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);

        (upsertProductLine as jest.Mock).mockImplementation((name: string, brandId?: string | null) => {
            return Promise.resolve({
                id: `id_${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
                canonical_name: name,
                normalized_key: name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
                brand_id: brandId || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        });
    });

    describe('deduplicateProductLines', () => {
        it('auto-merges new product lines with matching format suffixes in the same batch', async () => {
            const rawAssignments = new Map<string, string>([
                ['UPC-A', 'Earth Animal No-Hide Rolls'],
                ['UPC-B', 'Earth Animal No-Hide Stix'],
                ['UPC-C', 'Earth Animal No Hide Chews'],
            ]);

            const result = await deduplicateProductLines(rawAssignments, 'brand-123');

            expect(result.canonicalLabels.size).toBe(3);
            const record = result.canonicalLabels.get('earthanimalnohiderolls');
            expect(record).toBeDefined();
            expect(result.canonicalLabels.get('earthanimalnohidestix')?.id).toBe(record?.id);
            expect(result.canonicalLabels.get('earthanimalnohidechews')?.id).toBe(record?.id);
            expect(result.ambiguousUpcs.size).toBe(0);
        });

        it('auto-merges new product lines with existing matching core keys in the DB', async () => {
            mockDbLines = [
                {
                    id: 'existing-no-hide-id',
                    canonical_name: 'Earth Animal No-Hide Chews',
                    normalized_key: 'earthanimalnohidechews',
                    brand_id: 'brand-123',
                },
            ];

            const rawAssignments = new Map<string, string>([
                ['UPC-A', 'Earth Animal No-Hide Rolls'],
                ['UPC-B', 'Earth Animal No-Hide Stix'],
            ]);

            const result = await deduplicateProductLines(rawAssignments, 'brand-123');

            expect(result.canonicalLabels.size).toBe(2);
            expect(result.canonicalLabels.get('earthanimalnohiderolls')?.id).toBe('existing-no-hide-id');
            expect(result.canonicalLabels.get('earthanimalnohidestix')?.id).toBe('existing-no-hide-id');
            expect(result.ambiguousUpcs.size).toBe(0);
            expect(upsertProductLine).not.toHaveBeenCalled();
        });

        it('auto-merges prefix/suffix-aware substrings (e.g. Infinity Braid Bone vs Infinity Braid)', async () => {
            mockDbLines = [
                {
                    id: 'existing-infinity-braid',
                    canonical_name: 'Power Chew Infinity Braid',
                    normalized_key: 'powerchewinfinitybraid',
                    brand_id: 'brand-456',
                },
            ];

            const rawAssignments = new Map<string, string>([
                ['UPC-A', 'Power Chew Infinity Braid Bone'],
            ]);

            const result = await deduplicateProductLines(rawAssignments, 'brand-456');

            expect(result.canonicalLabels.get('powerchewinfinitybraidbone')?.id).toBe('existing-infinity-braid');
            expect(result.ambiguousUpcs.size).toBe(0);
            expect(upsertProductLine).not.toHaveBeenCalled();
        });

        it('flags ambiguous matches for human review when similarity is moderate (e.g. 0.80 - 0.90)', async () => {
            mockDbLines = [
                {
                    id: 'existing-brand-dog-food',
                    canonical_name: 'Super Premium Dry Dog Food',
                    normalized_key: 'superpremiumdrydogfood',
                    brand_id: 'brand-789',
                },
            ];

            const rawAssignments = new Map<string, string>([
                ['UPC-A', 'Super Premium Dog Food'],
            ]);

            const result = await deduplicateProductLines(rawAssignments, 'brand-789');

            expect(result.canonicalLabels.get('superpremiumdogfood')?.id).toBe('existing-brand-dog-food');
            expect(result.ambiguousUpcs.has('UPC-A')).toBe(true);
        });
    });
});
