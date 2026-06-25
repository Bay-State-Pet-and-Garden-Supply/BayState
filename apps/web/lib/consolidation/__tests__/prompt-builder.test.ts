import {
    buildUserPromptPayload,
    generateSystemPrompt,
} from '@/lib/consolidation/prompt-builder';

describe('brand placement in prompt-builder', () => {
    describe('generateSystemPrompt', () => {
        it('contains brand-first instruction in system prompt', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // System prompt should contain instruction to place brand at start of product names
            expect(prompt).toMatch(/brand.*first|first.*brand/i);
            expect(prompt).toMatch(/brand must be the first token/i);
        });

        it('handles brand at start: preserves brand when already first', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct to keep brand at start and not duplicate
            expect(prompt).toMatch(/source name already starts with the brand/i);
            expect(prompt).toMatch(/do not duplicate the brand/i);
        });

        it('handles brand not at start: moves brand to beginning of name', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct brand MUST be first token
            expect(prompt).toMatch(/brand must be the first token/i);
            expect(prompt).toMatch(/never drop the brand/i);
        });

        it('provides brand-first example in prompt', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should show the brand-first example
            expect(prompt).toContain('Blue Buffalo Dog Food');
        });



        it('includes OCR packaging evidence guidance', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            expect(prompt).toMatch(/OCR Packaging Evidence/i);
            expect(prompt).toMatch(/image_text/i);
            expect(prompt).toMatch(/strip extraneous text/i);
        });

        it('includes food-type ordering for consumable products', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            expect(prompt).toMatch(/food-type descriptor/i);
            expect(prompt).toMatch(/Dry Dog Food 30 lb/i);
        });

        it('instructs decimal size handling to preserve source-supported precision', () => {
            const categories = ['Dog Food', 'Cat Supplies'];

            const prompt = generateSystemPrompt(categories);

            expect(prompt).toMatch(/preserve source-supported decimal/i);
            expect(prompt).toMatch(/do not round or truncate/i);
            expect(prompt).toContain('1.06 oz.');
            expect(prompt).toContain('4.5 lb.');
        });

        it('requires source-supported variant differentiation', () => {
            const categories = ['Household'];

            const prompt = generateSystemPrompt(categories);

            expect(prompt).toMatch(/never produce identical names/i);
            expect(prompt).toMatch(/do not invent variant details/i);
            expect(prompt).toContain('Motorsport Container Red 5 Gal.');
        });


        it('includes source trust and keyword guidance', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/shopsite export-ready/i);
            expect(prompt).toMatch(/highest trust.*shopsite_input/i);
            expect(prompt).toMatch(/marketplace/i);
            expect(prompt).toMatch(/Output contract/i);
            expect(prompt).toMatch(/Allowed category values/i);
        });

        it('includes description rules and template guidance', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/Description rules:/i);
            expect(prompt).toMatch(/ALWAYS write a custom product description/i);
            expect(prompt).toMatch(/Template pattern: \[Full product name\] is a \[product type\] for \[target animal\/use\]/i);
            expect(prompt).toContain('Blue Buffalo Life Protection Dry Dog Food 30 lb.');
            expect(prompt).toMatch(/plain ASCII characters/i);
        });

        it('adds optional group consistency guidance and examples', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/sibling product context/i);
            expect(prompt).toMatch(/related upcs/i);
            expect(prompt).toMatch(/without inventing details/i);
        });

        it('includes strict weight and unit naming conventions', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/Size\/Weight Unit in Names/i);
            expect(prompt).toMatch(/Never convert ounces to pounds in the product name/i);
            expect(prompt).toMatch(/Ignore Shipping Weights for Names/i);
            expect(prompt).toMatch(/strictly for shipping calculations/i);
        });

        it('builds compact sibling product context when available', () => {
            const payload = buildUserPromptPayload(
                {
                    upc: 'UPC-123',
                    sources: {
                        shopsite_input: {
                            brand: 'Acme',
                            category: 'Dog > Food > Dry Food',
                        },
                    },
                    productLineContext: {
                        productLine: 'Acme Puppy Recipe',
                        expectedBrand: 'Acme',
                        expectedCategory: 'Dog > Food > Dry Food',
                        siblings: [
                            {
                                upc: 'SIB-1',
                                name: 'Acme Puppy Recipe Dog Food 4 lb.',
                                sources: {
                                    shopsite_input: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                upc: 'SIB-2',
                                name: 'Acme Puppy Recipe Dog Food 15 lb.',
                                sources: {
                                    amazon: {
                                        brand: 'Brand: Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                upc: 'SIB-3',
                                name: 'Acme Puppy Recipe Dog Food 30 lb.',
                                sources: {
                                    manufacturer: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                upc: 'SIB-4',
                                name: 'Acme Puppy Recipe Dog Food 40 lb.',
                                sources: {
                                    manufacturer: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                upc: 'SIB-5',
                                name: 'Acme Puppy Recipe Dog Food 30 lb.',
                                sources: {
                                    manufacturer: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                        ],
                    },
                },
                [
                    {
                        source: 'shopsite_input',
                        trust: 'canonical',
                        fields: {
                            brand: 'Acme',
                        },
                    },
                ]
            );

            expect(payload.product_line_context).toEqual(
                expect.objectContaining({
                    product_line: 'Acme Puppy Recipe',
                    expected_brand: 'Acme',
                    consistency_rules: expect.arrayContaining([
                        expect.stringMatching(/same brand/i),
                    ]),
                    consistency_examples: [
                        'Acme Puppy Recipe Dog Food 4 lb.',
                        'Acme Puppy Recipe Dog Food 15 lb.',
                        'Acme Puppy Recipe Dog Food 30 lb.',
                    ],
                })
            );
            expect(payload.product_line_context?.sibling_products).toHaveLength(3);
            expect(payload.product_line_context?.sibling_products[0]).toEqual({
                upc: 'SIB-1',
                name: 'Acme Puppy Recipe Dog Food 4 lb.',
                brand: 'Acme',
            });
        });

        it('omits sibling context when none is available', () => {
            const payload = buildUserPromptPayload(
                {
                    upc: 'UPC-123',
                    sources: {},
                },
                []
            );

            expect(payload).toEqual({
                upc: 'UPC-123',
                sources: [],
            });
            expect(payload.product_line_context).toBeUndefined();
        });
    });
});
