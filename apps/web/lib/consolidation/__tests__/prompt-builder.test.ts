import { generateSystemPrompt } from '@/lib/consolidation/prompt-builder';

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

        it('includes source trust and keyword guidance', () => {
            const prompt = generateSystemPrompt(['Dog > Food > Dry Food']);

            expect(prompt).toMatch(/highest trust.*shopsite_input/i);
            expect(prompt).toMatch(/marketplace/i);
            expect(prompt).toMatch(/search_keywords/i);
            expect(prompt).toContain('Allowed category values:');
            expect(prompt).toContain('Dog > Food > Dry Food');
            expect(prompt).toMatch(/deepest valid leaf taxonomy breadcrumb/i);
            expect(prompt).toMatch(/ortho home defense/i);
        });
    });
});
