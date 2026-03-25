import { generateSystemPrompt } from '@/lib/consolidation/prompt-builder';

describe('brand exclusion in prompt-builder', () => {
    describe('generateSystemPrompt', () => {
        it('contains brand exclusion instruction in system prompt', () => {
            const categories = ['Dog', 'Cat'];
            const productTypes = ['Dry Dog Food', 'Cat Litter'];

            const prompt = generateSystemPrompt(categories, productTypes);

            // System prompt should contain instruction to exclude brand names from product names
            expect(prompt).toMatch(/exclude.*brand/i);
        });

        it('handles brand at start: "Blue Buffalo Dog Food" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];
            const productTypes = ['Dry Dog Food', 'Cat Litter'];

            const prompt = generateSystemPrompt(categories, productTypes);

            // Should instruct to handle brand at start of product name
            expect(prompt).toMatch(/brand.*start|start.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles brand in middle: "Dog Food by Blue Buffalo" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];
            const productTypes = ['Dry Dog Food', 'Cat Litter'];

            const prompt = generateSystemPrompt(categories, productTypes);

            // Should instruct to handle brand in middle of product name
            expect(prompt).toMatch(/brand.*middle|middle.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles brand at end: "Dog Food Blue Buffalo" → excludes brand from name', () => {
            const categories = ['Dog', 'Cat'];
            const productTypes = ['Dry Dog Food', 'Cat Litter'];

            const prompt = generateSystemPrompt(categories, productTypes);

            // Should instruct to handle brand at end of product name
            expect(prompt).toMatch(/brand.*end|end.*brand/i);
            expect(prompt).toMatch(/exclude.*brand.*from.*name|remove.*brand.*from.*name/i);
        });

        it('handles case insensitive brand matching: "blue buffalo" matches "Blue Buffalo"', () => {
            const categories = ['Dog', 'Cat'];
            const productTypes = ['Dry Dog Food', 'Cat Litter'];

            const prompt = generateSystemPrompt(categories, productTypes);

            // Should instruct case-insensitive brand matching
            expect(prompt).toMatch(/case.*insensitive|insensitive|ignore.*case/i);
            expect(prompt).toMatch(/brand/i);
        });

        it('instructs decimal size handling to keep the leading whole number without rounding', () => {
            const categories = ['Dog Food', 'Cat Supplies'];
            const productTypes = ['Food', 'Treats'];

            const prompt = generateSystemPrompt(categories, productTypes);

            expect(prompt).toMatch(/leading whole-number portion|integer part/i);
            expect(prompt).toMatch(/do not round/i);
            expect(prompt).toContain('1.06 oz. → 1 oz.');
            expect(prompt).toContain('7.9 lb. → 7 lb.');
            expect(prompt).toContain('2.5 gal. → 2 gal.');
        });

        it('requires source-supported variant differentiation', () => {
            const categories = ['Household'];
            const productTypes = ['Bags'];

            const prompt = generateSystemPrompt(categories, productTypes);

            expect(prompt).toMatch(/never produce identical names/i);
            expect(prompt).toMatch(/do not invent variant details/i);
            expect(prompt).toContain('Motorsport Container Red 5 Gal.');
        });
    });
});
