import {
    extractClassificationEvidence,
    buildClassificationSystemPrompt,
    parseClassificationResponse,
    buildClassificationUserPrompt
} from '@/lib/consolidation/product-line-classification';

describe('Product Line Classification', () => {
    describe('extractClassificationEvidence', () => {
        it('should extract name, brand, and category, prioritizing trusted sources', () => {
            const sources = {
                amazon: {
                    name: 'Amazon SEO Padded Earth Animal No-Hide Chew SM 6PK',
                    brand: 'brand: Earth Animal',
                    category: 'Dog Treats'
                },
                bradley: {
                    name: 'EARTH ANIMAL NO HIDE STRWB CHEW SM 6PK',
                    brand: 'Earth Animal',
                    category: 'Dog Chews'
                }
            };
            const input = {
                name: 'EARTH ANIMAL NO HIDE CHEW 6PK',
                brand: 'Earth Animal'
            };

            const evidence = extractClassificationEvidence('810132876011', sources, input);

            // bradley is ranked 1 (more trusted than amazon rank 3)
            expect(evidence.name).toBe('EARTH ANIMAL NO HIDE STRWB CHEW SM 6PK');
            expect(evidence.brand).toBe('Earth Animal');
            expect(evidence.category).toBe('Dog Chews');
            expect(evidence.allSourceNames).toContain('[bradley] EARTH ANIMAL NO HIDE STRWB CHEW SM 6PK');
            expect(evidence.allSourceNames).toContain('[amazon] Amazon SEO Padded Earth Animal No-Hide Chew SM 6PK');
            expect(evidence.allSourceNames[0]).toBe('[shopsite_input] EARTH ANIMAL NO HIDE CHEW 6PK');
        });

        it('should extract flavor and format from source facets or name tokens', () => {
            const sources = {
                bradley: {
                    name: 'Wholesomes Rewards Chewy Sticks Beef 25oz',
                    brand: 'Wholesomes',
                    category: 'Dog Treats',
                    extracted: {
                        facets: [
                            { definition_slug: 'flavor', value: 'Beef' }
                        ]
                    }
                }
            };
            const evidence = extractClassificationEvidence('034846727043', sources, null);
            expect(evidence.detected_flavor).toBe('Beef');
            expect(evidence.detected_format).toBe('Sticks'); // from name token fallback
        });
    });

    describe('buildClassificationUserPrompt', () => {
        it('should append detected flavor and format to prompt parts', () => {
            const evidence = {
                brand: 'Wholesomes',
                name: 'Wholesomes Rewards Chewy Sticks Beef 25oz',
                category: 'Dog Treats',
                detected_flavor: 'Beef',
                detected_format: 'Sticks'
            };
            const prompt = buildClassificationUserPrompt(evidence);
            expect(prompt).toContain('Brand: Wholesomes');
            expect(prompt).toContain('Detected Flavor: Beef');
            expect(prompt).toContain('Detected Format: Sticks');
        });
    });

    describe('buildClassificationSystemPrompt', () => {
        it('should build prompt with flavor/formula rules and examples', () => {
            const prompt = buildClassificationSystemPrompt([
                { id: '1', canonical_name: 'No-Hide Rolls' }
            ]);

            expect(prompt).toContain('flavor/formula and format');
            expect(prompt).toContain('MUST belong to separate product lines');
            expect(prompt).toContain('Earth Animal No-Hide Chew - Chicken');
            expect(prompt).toContain('Wholesomes Rewards Chewy Sticks - Beef');
            expect(prompt).toContain('Wholesomes Rewards Chewy Sticks Beef 25oz');
        });
    });

    describe('parseClassificationResponse', () => {
        it('should parse direct JSON string correctly', () => {
            const responseText = JSON.stringify({
                product_line: 'Earth Animal No-Hide Chew - Strawberry',
                confidence: 0.95,
                rationale: 'Clean flavor-specific match'
            });

            const result = parseClassificationResponse('810132876011', responseText);
            expect(result).toEqual({
                upc: '810132876011',
                product_line: 'Earth Animal No-Hide Chew - Strawberry',
                confidence: 0.95,
                rationale: 'Clean flavor-specific match'
            });
        });

        it('should parse JSON wrapped in markdown blocks', () => {
            const responseText = '```json\n{\n  "product_line": "Wholesomes Rewards Chewy Sticks - Beef",\n  "confidence": "0.90",\n  "rationale": "Matches manufacturer naming"\n}\n```';

            const result = parseClassificationResponse('034846727043', responseText);
            expect(result).toEqual({
                upc: '034846727043',
                product_line: 'Wholesomes Rewards Chewy Sticks - Beef',
                confidence: 0.9,
                rationale: 'Matches manufacturer naming'
            });
        });

        it('should return null for invalid or incomplete responses', () => {
            const invalidText = '{"invalid": "format"}';
            const result = parseClassificationResponse('123456789012', invalidText);
            expect(result).toBeNull();
        });
    });
});
