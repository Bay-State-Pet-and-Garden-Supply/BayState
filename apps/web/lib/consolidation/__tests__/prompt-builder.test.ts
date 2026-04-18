import {
    buildUserPromptPayload,
    generateSystemPrompt,
} from '@/lib/consolidation/prompt-builder';

describe('brand exclusion in prompt-builder', () => {
    describe('generateSystemPrompt', () => {
        it('contains brand exclusion instruction in system prompt', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // System prompt should contain instruction to exclude brand names from product names
            expect(prompt).toMatch(/exclude.*brand/i);
        });

        it('handles brand at start: "Blue Buffalo Dog Food" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct to handle brand at start of product name
            expect(prompt).toMatch(/brand.*start|start.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles brand in middle: "Dog Food by Blue Buffalo" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct to handle brand in middle of product name
            expect(prompt).toMatch(/brand.*middle|middle.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles brand at end: "Dog Food Blue Buffalo" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct to handle brand at end of product name
            expect(prompt).toMatch(/brand.*end|end.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles case insensitive brand matching: "blue buffalo" matches "Blue Buffalo"', () => {
            const categories = ['Dog', 'Cat'];

            const prompt = generateSystemPrompt(categories);

            // Should instruct case-insensitive brand matching
            expect(prompt).toMatch(/case.*insensitive|insensitive|ignore.*case/i);
            expect(prompt).toMatch(/brand/i);
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

        it('routes planting seed products to seeds and seed starting pages', () => {
            const prompt = generateSystemPrompt(['Lawn & Garden > Flower & Vegetable Seeds']);

            expect(prompt).toMatch(/planting seed products should use Seeds & Seed Starting/i);
            expect(prompt).toMatch(/Do not use Farm Animal, Bird, Small Pet, or Wild Bird pages/i);
            expect(prompt).toMatch(/never use service-only pages such as #Services/i);
            expect(prompt).toContain('Lawn & Garden Shop All');
        });

        it('includes source trust and keyword guidance', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/shopsite export-ready/i);
            expect(prompt).toMatch(/highest trust.*shopsite_input/i);
            expect(prompt).toMatch(/marketplace/i);
            expect(prompt).toMatch(/response schema already constrains/i);
            expect(prompt).not.toContain('Allowed category values:');
        });

        it('adds optional cohort consistency guidance and examples', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/sibling product context/i);
            expect(prompt).toMatch(/related skus/i);
            expect(prompt).toMatch(/without inventing details/i);
        });

        it('builds compact sibling product context when available', () => {
            const payload = buildUserPromptPayload(
                {
                    sku: 'SKU-123',
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
                                sku: 'SIB-1',
                                name: 'Acme Puppy Recipe Dog Food 4 lb.',
                                sources: {
                                    shopsite_input: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                sku: 'SIB-2',
                                name: 'Acme Puppy Recipe Dog Food 15 lb.',
                                sources: {
                                    amazon: {
                                        brand: 'Brand: Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                sku: 'SIB-3',
                                name: 'Acme Puppy Recipe Dog Food 30 lb.',
                                sources: {
                                    manufacturer: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                sku: 'SIB-4',
                                name: 'Acme Puppy Recipe Dog Food 40 lb.',
                                sources: {
                                    manufacturer: {
                                        brand: 'Acme',
                                        category: 'Dog > Food > Dry Food',
                                    },
                                },
                            },
                            {
                                sku: 'SIB-5',
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
                sku: 'SIB-1',
                name: 'Acme Puppy Recipe Dog Food 4 lb.',
                brand: 'Acme',
            });
        });

        it('omits sibling context when none is available', () => {
            const payload = buildUserPromptPayload(
                {
                    sku: 'SKU-123',
                    sources: {},
                },
                []
            );

            expect(payload).toEqual({
                sku: 'SKU-123',
                sources: [],
            });
            expect(payload.product_line_context).toBeUndefined();
        });
    });
});
