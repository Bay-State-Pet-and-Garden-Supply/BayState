import {
    buildResponseSchema,
    validateConsolidationTaxonomy,
    validateRequiredConsolidationFields,
} from '@/lib/consolidation/taxonomy-validator';

describe('validateConsolidationTaxonomy', () => {
    it('deduplicates category and product_type arrays', () => {
        const result = validateConsolidationTaxonomy(
            {
                category: ['Dog', 'Dog', 'Cat'],
                product_type: ['Dry Dog Food', 'Dry Dog Food'],
            },
            ['Dog', 'Cat'],
            ['Dry Dog Food', 'Dog Treats']
        );

        expect(result.category).toBe('Dog|Cat');
        expect(result.product_type).toBe('Dry Dog Food');
    });

    it('throws when category is missing after validation', () => {
        expect(() =>
            validateConsolidationTaxonomy(
                {
                    product_type: ['Dry Dog Food'],
                },
                ['Dog'],
                ['Dry Dog Food']
            )
        ).toThrow('category is required');
    });

    it('throws when product_type is missing after validation', () => {
        expect(() =>
            validateConsolidationTaxonomy(
                {
                    category: ['Dog'],
                },
                ['Dog'],
                ['Dry Dog Food']
            )
        ).toThrow('product_type is required');
    });

    it('buildResponseSchema includes search_keywords as a required field', () => {
        const schema = buildResponseSchema(['Dog'], ['Food']) as {
            json_schema?: {
                schema?: {
                    properties?: Record<string, unknown>;
                    required?: string[];
                };
            };
        };

        const properties = schema.json_schema?.schema?.properties || {};
        const required = schema.json_schema?.schema?.required || [];

        expect(properties).toHaveProperty('search_keywords');
        expect(required).toContain('search_keywords');
    });

    it('buildResponseSchema does not contain keywords unsupported by OpenAI Structured Outputs (strict mode)', () => {
        const schema = buildResponseSchema(['Dog'], ['Food'], ['Page 1']) as any;
        const rootSchema = schema.json_schema?.schema || {};
        const properties = rootSchema.properties || {};

        // Helper to check for unsupported keywords in an object
        const checkUnsupported = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            const unsupported = ['minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'pattern', 'format'];
            for (const key of unsupported) {
                expect(obj).not.toHaveProperty(key);
            }
            if (obj.properties) {
                for (const prop of Object.values(obj.properties)) {
                    checkUnsupported(prop);
                }
            }
            if (obj.items) {
                checkUnsupported(obj.items);
            }
        };

        checkUnsupported(rootSchema);
    });

    it('validateRequiredConsolidationFields rejects blank required strings', () => {
        expect(() =>
            validateRequiredConsolidationFields({
                name: 'Valid Name',
                brand: 'Valid Brand',
                description: 'Valid description.',
                long_description: 'Valid long description.',
                search_keywords: '   ',
                confidence_score: 0.8,
            })
        ).toThrow('search_keywords is required');
    });
});
