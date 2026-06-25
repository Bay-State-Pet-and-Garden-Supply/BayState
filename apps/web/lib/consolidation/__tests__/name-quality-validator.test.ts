import { validateProductNameQuality } from '../name-quality-validator';

function baseInput(overrides: Partial<Parameters<typeof validateProductNameQuality>[0]> = {}) {
    return {
        upc: '034846727074',
        name: 'Wholesomes Rewards Chewy Sticks Whitefish 25 oz.',
        input: { name: 'WHOLESOMES CHEWY STI CKS WHITEFISH 25OZ' },
        sources: {
            bradley: {
                _evidence_url: 'https://www.bradleycaldwell.com/wholesomes-rewards-chewy-sticks-whitefish-25-oz-055425',
                core: {
                    name: 'WHOLESOMES REWARDS CHEWY STICKS',
                    weight_lbs: 3,
                },
                package_weight: 'Weight: 3 lb',
            },
        },
        packagingFacets: { flavor: 'Whitefish', size: '25 oz.' },
        shippingWeight: '3',
        ...overrides,
    };
}

describe('name-quality-validator', () => {
    it('accepts a source-supported Wholesomes name', () => {
        const result = validateProductNameQuality(baseInput());
        expect(result.errors).toEqual([]);
    });

    it('rejects duplicate size plus unsupported grams conversion', () => {
        const result = validateProductNameQuality(baseInput({
            upc: '034846730449',
            name: 'Wholesomes Rewards Chewy Mini Sticks Dog Treat 7 OZ. (198 G) 7 oz.',
            input: { name: 'WHOLESOMES CHEWY STI CKS BEEF 7OZ' },
            sources: {
                bradley: {
                    _evidence_url: 'https://www.bradleycaldwell.com/wholesomes-rewards-chewy-sticks-beef-7-oz-055422',
                    core: { name: 'WHOLESOMES REWARDS CHEWY STICKS', weight_lbs: 0.7 },
                },
            },
            packagingFacets: { flavor: 'Beef', size: '7 oz.' },
            shippingWeight: '0.44',
        }));

        expect(result.errors).toEqual(expect.arrayContaining([
            expect.stringContaining('repeats size/unit'),
            expect.stringContaining('unsupported metric conversion'),
            expect.stringContaining('unsupported qualifier "mini"'),
        ]));
    });

    it('rejects names missing source-supported flavor', () => {
        const result = validateProductNameQuality(baseInput({
            name: 'Wholesomes Rewards Chewy Sticks Dog Treat 25 oz.',
        }));

        expect(result.errors).toContain('product name is missing source-supported flavor/variant "whitefish"');
    });

    it('rejects shipping weight in name when advertised size is known', () => {
        const result = validateProductNameQuality(baseInput({
            name: 'Wholesomes Rewards Chewy Sticks Whitefish 3 lb.',
        }));

        expect(result.errors).toEqual(expect.arrayContaining([
            'product name is missing advertised size 25 oz.',
            'product name uses shipping weight 3 lb. instead of advertised size 25 oz.',
        ]));
    });

    it('rejects unsupported merchandising tokens in product name', () => {
        const result = validateProductNameQuality(baseInput({
            upc: '034846727050',
            name: 'Wholesomes Rewards Chewy Strips Chicken Protein 25 oz.',
            input: { name: 'WHOLESOMES CHEWY STR IPS CHICKEN 25OZ' },
            sources: {
                bradley: {
                    _evidence_url: 'https://www.bradleycaldwell.com/wholesomes-rewards-chewy-strips-chicken-25-oz-055421',
                    core: { name: 'WHOLESOMES REWARDS CHEWY STRIPS', weight_lbs: 3 },
                },
            },
            packagingFacets: { flavor: 'Chicken', size: '25 oz.' },
        }));

        expect(result.errors).toContain('product name includes unsupported merchandising token "protein"');
    });
});
