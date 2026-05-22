import {
    brandConsistencyRule,
    createConsistencyRules,
    descriptionFormatRule,
    validateConsistency,
} from '@/lib/consolidation/consistency-rules';
import type { ProductSource } from '@/lib/consolidation/types';

function createProductSource(
    upc: string,
    shopsiteInput: Record<string, unknown>,
    productLineContext?: ProductSource['productLineContext']
): ProductSource {
    return {
        upc,
        sources: {
            shopsite_input: shopsiteInput,
        },
        productLineContext,
    };
}

describe('consistency rules', () => {
    it('flags conflicting brands within a product line', () => {
        const violations = brandConsistencyRule.validate([
            createProductSource('UPC-1', { brand: 'Acme', category: 'Dog > Food > Dry' }),
            createProductSource('UPC-2', { brand: 'ACME', category: 'Dog > Food > Dry' }),
            createProductSource('UPC-3', { brand: 'Bravo', category: 'Dog > Food > Dry' }),
        ]);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'brand-consistency',
            severity: 'error',
            field: 'brand',
            expected: 'Acme',
            products: ['UPC-3'],
        });
        expect(violations[0].message).toMatch(/expected acme/i);
        expect(violations[0].actual).toMatch(/Acme/);
        expect(violations[0].actual).toMatch(/Bravo/);
    });

    it('tolerates missing brands and whitespace-only brand variation', () => {
        const violations = brandConsistencyRule.validate([
            createProductSource('UPC-1', { brand: 'Acme' }),
            createProductSource('UPC-2', { brand: '  acme  ' }),
            createProductSource('UPC-3', { description: 'Brand missing here.' }),
        ]);

        expect(violations).toEqual([]);
    });

    it('flags description structure outliers without requiring exact copy', () => {
        const violations = descriptionFormatRule.validate([
            createProductSource('UPC-1', {
                description: 'Balanced dry food for adult dogs. Crafted with chicken and brown rice for everyday nutrition.',
            }),
            createProductSource('UPC-2', {
                description: 'Complete daily nutrition for adult dogs. Supports digestion and healthy skin with added omega oils.',
            }),
            createProductSource('UPC-3', {
                description: '- Crunchy texture\n- Real chicken recipe\n- Great for active dogs',
            }),
        ]);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'description-format',
            severity: 'warning',
            field: 'description',
            products: ['UPC-3'],
        });
        expect(violations[0].message).toMatch(/similar structure/i);
        expect(violations[0].actual).toMatch(/bullet format/i);
    });

    it('allows reasonable prose description variation', () => {
        const violations = descriptionFormatRule.validate([
            createProductSource('UPC-1', {
                description: 'Soft chews for daily joint support.',
            }),
            createProductSource('UPC-2', {
                description: 'Soft chews for daily joint support. Includes glucosamine for active dogs.',
            }),
            createProductSource('UPC-3', {
                description: 'Daily joint support chews with a savory chicken flavor.',
            }),
        ]);

        expect(violations).toEqual([]);
    });

    it('supports configurable severity overrides when validating all rules', () => {
        const rules = createConsistencyRules({
            severities: {
                'brand-consistency': 'warning',
                'description-format': 'info',
            },
        });

        const violations = validateConsistency(
            [
                createProductSource('UPC-1', {
                    brand: 'Acme',
                    category: 'Dog > Food > Dry',
                    description: 'Balanced dry food for adult dogs.',
                }),
                createProductSource('UPC-2', {
                    brand: 'Bravo',
                    category: 'Dog > Food > Dry',
                    description: 'Balanced dry food for adult dogs.',
                }),
            ],
            rules
        );

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'brand-consistency',
            severity: 'warning',
        });
    });
});
