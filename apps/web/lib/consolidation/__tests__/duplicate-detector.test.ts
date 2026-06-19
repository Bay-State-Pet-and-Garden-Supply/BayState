import {
    tryDisambiguateDuplicateNames,
    extractSizeFromInputName,
    type DisambiguationRecord,
} from '../duplicate-detector';

describe('duplicate-detector', () => {
    // =========================================================================
    // extractSizeFromInputName — unit tests for POS name parsing
    // =========================================================================

    describe('extractSizeFromInputName', () => {
        it('parses abbreviated size + weight: "SM 6OZ" → "Small 6 oz."', () => {
            expect(extractSizeFromInputName('PUPSICLE REFILL CALM ING BBQ SM 6OZ')).toBe('Small 6 oz.');
        });

        it('parses abbreviated size + weight: "LG 8OZ" → "Large 8 oz."', () => {
            expect(extractSizeFromInputName('PUPSICLE REFILL CALM ING BBQ LG 8OZ')).toBe('Large 8 oz.');
        });

        it('parses weight only: "3.5OZ" → "3.5 oz."', () => {
            expect(extractSizeFromInputName('HONEST KITCHEN BISCU ITS CHEDDAR 3.5OZ')).toBe('3.5 oz.');
        });

        it('parses pound weight: "30LB" → "30 lb."', () => {
            expect(extractSizeFromInputName('DRY DOG FOOD CHICKEN 30LB')).toBe('30 lb.');
        });

        it('parses count: "10CT" → "10 ct."', () => {
            expect(extractSizeFromInputName('DOG TREATS VARIETY 10CT')).toBe('10 ct.');
        });

        it('returns null for names without size', () => {
            expect(extractSizeFromInputName('DOG TOY ROPE')).toBeNull();
        });

        it('returns null for undefined/empty', () => {
            expect(extractSizeFromInputName(undefined)).toBeNull();
            expect(extractSizeFromInputName('')).toBeNull();
        });

        it('handles size qualifier without a number', () => {
            expect(extractSizeFromInputName('PUPSICLE REFILL BBQ SM')).toBe('Small');
        });
    });

    // =========================================================================
    // tryDisambiguateDuplicateNames — Layer 1: raw sources
    // =========================================================================

    describe('Layer 1: disambiguation via raw sources', () => {
        it('disambiguates using top-level size field in sources', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { core: { name: 'Product Name' } } },
                { upc: 'UPC-B', next_fields: { core: { name: 'Product Name' } } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', { sources: { manual: { size: 'Small' } } }],
                ['UPC-B', { sources: { manual: { size: 'Large' } } }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('UPC-A')).toBe('Product Name Small');
            expect(result?.get('UPC-B')).toBe('Product Name Large');
        });

        it('disambiguates using facets in sources (realistic scraper shape)', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
                { upc: 'UPC-B', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Small 10 Count' },
                            facets: [
                                { definition_slug: 'size', value: 'Small', confidence_score: null },
                                { definition_slug: 'dimensions', value: '8 x 6.5 x 2 inches' },
                            ],
                        },
                    },
                }],
                ['UPC-B', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Large 7 Count' },
                            facets: [
                                { definition_slug: 'size', value: 'Large', confidence_score: null },
                                { definition_slug: 'dimensions', value: '7.76 x 6.06 x 1.73 inches' },
                            ],
                        },
                    },
                }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('UPC-A')).toBe('WOOF Pupsicle BBQ Calming Pops Small');
            expect(result?.get('UPC-B')).toBe('WOOF Pupsicle BBQ Calming Pops Large');
        });

        it('inserts color differentiator before size units', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { name: 'Motorsport Container 5 Gal.' } },
                { upc: 'UPC-B', next_fields: { name: 'Motorsport Container 5 Gal.' } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', { sources: { manual: { color: 'Red' } } }],
                ['UPC-B', { sources: { manual: { color: 'Yellow' } } }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('UPC-A')).toBe('Motorsport Container Red 5 Gal.');
            expect(result?.get('UPC-B')).toBe('Motorsport Container Yellow 5 Gal.');
        });
    });

    // =========================================================================
    // tryDisambiguateDuplicateNames — Layer 2: consolidated facets
    // =========================================================================

    describe('Layer 2: disambiguation via consolidated facets', () => {
        it('falls back to consolidated facets when sources lack the field', () => {
            const group = [
                { upc: '850075865932', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
                { upc: '850075865949', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
            ];

            // Sources have NO size field (matches real Amazon scraper output)
            // Consolidated HAS size facet (from previous consolidation run)
            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['850075865932', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Small 10 Count' },
                            facets: [
                                { definition_slug: 'dimensions', value: '8 x 6.5 x 2 inches; 7.04 ounces' },
                            ],
                        },
                    },
                    consolidated: {
                        core: { name: 'WOOF Pupsicle BBQ Calming Pops Small 8 oz.' },
                        facets: [
                            { definition_slug: 'size', value: 'small', confidence_score: 1 },
                            { definition_slug: 'package_weight', value: '0.4400', confidence_score: 1 },
                        ],
                    },
                }],
                ['850075865949', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Large 7 Count' },
                            facets: [
                                { definition_slug: 'dimensions', value: '7.76 x 6.06 x 1.73 inches; 8.47 ounces' },
                            ],
                        },
                    },
                    consolidated: {
                        core: { name: 'WOOF Pupsicle BBQ Calming Pops Large 8 oz.' },
                        facets: [
                            { definition_slug: 'size', value: 'Large', confidence_score: 1 },
                            { definition_slug: 'package_weight', value: '0.5294', confidence_score: 1 },
                        ],
                    },
                }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('850075865932')).toContain('small');
            expect(result?.get('850075865949')).toContain('Large');
        });

        it('uses consolidated core fields as fallback', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { core: { name: 'Test Product' } } },
                { upc: 'UPC-B', next_fields: { core: { name: 'Test Product' } } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', {
                    sources: {},
                    consolidated: { core: { weight: '6 oz' }, facets: [] },
                }],
                ['UPC-B', {
                    sources: {},
                    consolidated: { core: { weight: '12 oz' }, facets: [] },
                }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('UPC-A')).toBe('Test Product 6 oz');
            expect(result?.get('UPC-B')).toBe('Test Product 12 oz');
        });
    });

    // =========================================================================
    // tryDisambiguateDuplicateNames — Layer 3: POS input name parsing
    // =========================================================================

    describe('Layer 3: disambiguation via POS input name', () => {
        it('parses size from input.name when sources and consolidated lack structured size', () => {
            const group = [
                { upc: '850075865932', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
                { upc: '850075865949', next_fields: { core: { name: 'WOOF Pupsicle BBQ Calming Pops' } } },
            ];

            // Neither sources nor consolidated have a usable size field
            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['850075865932', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Small 10 Count' },
                            facets: [
                                { definition_slug: 'dimensions', value: '8 x 6.5 x 2 inches; 7.04 ounces' },
                            ],
                        },
                    },
                    input: {
                        upc: '850075865932',
                        name: 'PUPSICLE REFILL CALM ING BBQ SM 6OZ',
                        price: 19.99,
                    },
                }],
                ['850075865949', {
                    sources: {
                        amazon: {
                            core: { name: 'WOOF BBQ Pops - Large 7 Count' },
                            facets: [
                                { definition_slug: 'dimensions', value: '7.76 x 6.06 x 1.73 inches; 8.47 ounces' },
                            ],
                        },
                    },
                    input: {
                        upc: '850075865949',
                        name: 'PUPSICLE REFILL CALM ING BBQ LG 8OZ',
                        price: 19.99,
                    },
                }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            expect(result?.get('850075865932')).toBe('WOOF Pupsicle BBQ Calming Pops Small 6 oz.');
            expect(result?.get('850075865949')).toBe('WOOF Pupsicle BBQ Calming Pops Large 8 oz.');
        });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe('edge cases', () => {
        it('returns null when all values are identical (no differentiation possible)', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { name: 'Identical Item' } },
                { upc: 'UPC-B', next_fields: { name: 'Identical Item' } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', { sources: { manual: { size: 'Medium' } } }],
                ['UPC-B', { sources: { manual: { size: 'Medium' } } }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).toBeNull();
        });

        it('returns null when no disambiguation data exists anywhere', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { name: 'Mystery Item' } },
                { upc: 'UPC-B', next_fields: { name: 'Mystery Item' } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', { sources: {} }],
                ['UPC-B', { sources: {} }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).toBeNull();
        });

        it('prefers sources over consolidated when both have the field', () => {
            const group = [
                { upc: 'UPC-A', next_fields: { core: { name: 'Product' } } },
                { upc: 'UPC-B', next_fields: { core: { name: 'Product' } } },
            ];

            const existingByUpc = new Map<string, DisambiguationRecord>([
                ['UPC-A', {
                    sources: { manual: { size: 'Small' } },
                    consolidated: { facets: [{ definition_slug: 'size', value: 'Tiny' }] },
                }],
                ['UPC-B', {
                    sources: { manual: { size: 'Large' } },
                    consolidated: { facets: [{ definition_slug: 'size', value: 'Huge' }] },
                }],
            ]);

            const result = tryDisambiguateDuplicateNames(group, existingByUpc);
            expect(result).not.toBeNull();
            // Should use sources value ("Small"/"Large"), not consolidated ("Tiny"/"Huge")
            expect(result?.get('UPC-A')).toBe('Product Small');
            expect(result?.get('UPC-B')).toBe('Product Large');
        });
    });
});
