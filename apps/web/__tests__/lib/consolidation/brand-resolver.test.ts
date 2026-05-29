import { cleanBrandLabel, createBrandResolver, normalizeLookupKey } from '@/lib/consolidation/brand-resolver';

describe('normalizeLookupKey', () => {
    it('normalizes spaces and non-alphanumeric characters', () => {
        expect(normalizeLookupKey('  Blue Buffalo!  ')).toBe('bluebuffalo');
        expect(normalizeLookupKey('Purina One')).toBe('purinaone');
    });
});

describe('cleanBrandLabel', () => {
    it('removes brand prefixes and trims whitespace', () => {
        expect(cleanBrandLabel('Brand: Blue Buffalo')).toBe('Blue Buffalo');
        expect(cleanBrandLabel('  brand: Purina  ')).toBe('Purina');
        expect(cleanBrandLabel('KONG')).toBe('KONG');
        expect(cleanBrandLabel(null)).toBeUndefined();
    });
});

describe('BrandResolver', () => {
    let supabaseMock: any;

    beforeEach(() => {
        supabaseMock = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
        };
    });

    it('caches and resolves existing brand by name', async () => {
        supabaseMock.select.mockResolvedValueOnce({
            data: [
                { id: '1', name: 'Blue Buffalo', slug: 'blue-buffalo' },
            ],
            error: null,
        });

        const resolver = await createBrandResolver(supabaseMock);
        const result = await resolver.resolveBrand('Blue Buffalo');

        expect(result).toEqual({
            brandId: '1',
            brandName: 'Blue Buffalo',
        });
        expect(supabaseMock.from).toHaveBeenCalledTimes(1); // Loaded from cache, no DB queries
    });

    it('creates a missing brand and caches it for subsequent calls', async () => {
        // Initial load
        supabaseMock.select.mockResolvedValueOnce({
            data: [],
            error: null,
        });

        // Insert mock response
        supabaseMock.single.mockResolvedValueOnce({
            data: { id: 'new-id' },
            error: null,
        });

        const resolver = await createBrandResolver(supabaseMock);
        
        // Resolve once (triggers insert)
        const result1 = await resolver.resolveBrand('New Brand');
        expect(result1).toEqual({
            brandId: 'new-id',
            brandName: 'New Brand',
        });
        expect(supabaseMock.insert).toHaveBeenCalledWith({
            name: 'New Brand',
            slug: 'new-brand',
        });

        // Resolve again (uses cache)
        const result2 = await resolver.resolveBrand('New Brand');
        expect(result2).toEqual({
            brandId: 'new-id',
            brandName: 'New Brand',
        });
        expect(supabaseMock.insert).toHaveBeenCalledTimes(1); // Cache hit, no second insert
    });
});
