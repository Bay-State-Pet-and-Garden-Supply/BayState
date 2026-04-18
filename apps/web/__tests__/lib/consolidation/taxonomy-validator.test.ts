import {
    buildOpenAIResponseFormat,
    buildResponseSchema,
    validateConsolidationTaxonomy,
    validateRequiredConsolidationFields,
} from '@/lib/consolidation/taxonomy-validator';

describe('validateConsolidationTaxonomy', () => {
    it('deduplicates category arrays while preserving unrelated fields', () => {
        const result = validateConsolidationTaxonomy(
            {
                category: ['Dog > Food > Dry Food', 'Dog > Food > Dry Food', 'Cat > Food > Dry Food'],
                some_other_field: 'value',
            },
            ['Dog > Food > Dry Food', 'Cat > Food > Dry Food']
        );

        expect(result.category).toBe('Dog > Food > Dry Food|Cat > Food > Dry Food');
        expect(result.some_other_field).toBe('value');
    });

    it('buildOpenAIResponseFormat wraps the raw response schema', () => {
        const rawSchema = buildResponseSchema(['Dog > Food > Dry Food'], ['Food']);
        const responseFormat = buildOpenAIResponseFormat(rawSchema) as {
            json_schema?: {
                strict?: boolean;
                schema?: Record<string, unknown>;
            };
        };

        expect(responseFormat.json_schema?.strict).toBe(true);
        expect(responseFormat.json_schema?.schema).toEqual(rawSchema);
    });

    it('buildResponseSchema does not contain keywords unsupported by OpenAI Structured Outputs (strict mode)', () => {
        const rootSchema = buildResponseSchema(['Dog > Food > Dry Food'], ['Page 1']) as any;
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
                name: '   ',
                brand: 'Valid Brand',
                confidence_score: 0.8,
            })
        ).toThrow('Invalid consolidation output: name is required');
        
        expect(() =>
            validateRequiredConsolidationFields({
                name: 'Valid Name',
                brand: '',
                confidence_score: 0.8,
            })
        ).toThrow('Invalid consolidation output: brand is required');
    });

    it('normalizes taxonomy breadcrumbs without spaces around separators', () => {
        const result = validateConsolidationTaxonomy(
            {
                category: ['Dog>Food>Dry Food'],
            },
            ['Dog > Food > Dry Food']
        );

        expect(result.category).toBe('Dog > Food > Dry Food');
    });
});
