import {
    brandConsistencyRule,
    categoryConsistencyRule,
    createConsistencyRules,
    descriptionFormatRule,
    validateConsistency,
} from '@/lib/consolidation/consistency-rules';
import type { ProductSource } from '@/lib/consolidation/types';

function createProductSource(
    sku: string,
    shopsiteInput: Record<string, unknown>,
    productLineContext?: ProductSource['productLineContext']
): ProductSource {
    return {
        sku,
        sources: {
            shopsite_input: shopsiteInput,
        },
        productLineContext,
    };
}

describe('consistency rules', () => {
    it('flags conflicting brands within a product line', () => {
        const violations = brandConsistencyRule.validate([
            createProductSource('SKU-1', { brand: 'Acme', category: 'Dog > Food > Dry' }),
            createProductSource('SKU-2', { brand: 'ACME', category: 'Dog > Food > Dry' }),
            createProductSource('SKU-3', { brand: 'Bravo', category: 'Dog > Food > Dry' }),
        ]);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'brand-consistency',
            severity: 'error',
            field: 'brand',
            expected: 'Acme',
            products: ['SKU-3'],
        });
        expect(violations[0].message).toMatch(/expected acme/i);
        expect(violations[0].actual).toMatch(/Acme/);
        expect(violations[0].actual).toMatch(/Bravo/);
    });

    it('tolerates missing brands and whitespace-only brand variation', () => {
        const violations = brandConsistencyRule.validate([
            createProductSource('SKU-1', { brand: 'Acme' }),
            createProductSource('SKU-2', { brand: '  acme  ' }),
            createProductSource('SKU-3', { description: 'Brand missing here.' }),
        ]);

        expect(violations).toEqual([]);
    });

    it('normalizes taxonomy formatting before flagging category mismatches', () => {
        const violations = categoryConsistencyRule.validate([
            createProductSource('SKU-1', { category: 'Dog>Food>Dry' }),
            createProductSource('SKU-2', { category: 'Dog > Food > Dry' }),
            createProductSource('SKU-3', { category: 'Dog > Treats > Crunchy' }),
        ]);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'category-consistency',
            severity: 'error',
            field: 'category',
            expected: 'Dog > Food > Dry',
            products: ['SKU-3'],
        });
        expect(violations[0].message).toMatch(/taxonomy/i);
        expect(violations[0].actual).toMatch(/Dog > Treats > Crunchy/);
    });

    it('flags description structure outliers without requiring exact copy', () => {
        const violations = descriptionFormatRule.validate([
            createProductSource('SKU-1', {
                description: 'Balanced dry food for adult dogs. Crafted with chicken and brown rice for everyday nutrition.',
            }),
            createProductSource('SKU-2', {
                description: 'Complete daily nutrition for adult dogs. Supports digestion and healthy skin with added omega oils.',
            }),
            createProductSource('SKU-3', {
                description: '- Crunchy texture\n- Real chicken recipe\n- Great for active dogs',
            }),
        ]);

        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            rule: 'description-format',
            severity: 'warning',
            field: 'description',
            products: ['SKU-3'],
        });
        expect(violations[0].message).toMatch(/similar structure/i);
        expect(violations[0].actual).toMatch(/bullet format/i);
    });

    it('allows reasonable prose description variation', () => {
        const violations = descriptionFormatRule.validate([
            createProductSource('SKU-1', {
                description: 'Soft chews for daily joint support.',
            }),
            createProductSource('SKU-2', {
                description: 'Soft chews for daily joint support. Includes glucosamine for active dogs.',
            }),
            createProductSource('SKU-3', {
                description: 'Daily joint support chews with a savory chicken flavor.',
            }),
        ]);

        expect(violations).toEqual([]);
    });

    it('supports configurable severity overrides when validating all rules', () => {
        const rules = createConsistencyRules({
            severities: {
                'brand-consistency': 'warning',
                'category-consistency': 'info',
                'description-format': 'info',
            },
        });

        const violations = validateConsistency(
            [
                createProductSource('SKU-1', {
                    brand: 'Acme',
                    category: 'Dog > Food > Dry',
                    description: 'Balanced dry food for adult dogs.',
                }),
                createProductSource('SKU-2', {
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
