import { parseStructuredConsolidationText } from '@/lib/consolidation/result-parsing';

describe('Result Parsing with Zod Validation', () => {
    const validCategories = ['Dog > Food > Dry Food', 'Cat > Food > Dry Food'];

    const validJson = JSON.stringify({
        name: 'Blue Buffalo Chicken Dog Food 30 lb.',
        brand: 'Blue Buffalo',
        weight: '30.00',
        confidence_score: 0.95,
        category: 'Dog > Food > Dry Food',
        description: 'High-quality dry dog food.',
        search_keywords: 'dog, food, chicken, blue buffalo',
    });

    it('successfully parses valid JSON matching schema', () => {
        const result = parseStructuredConsolidationText('1234567890', validJson, validCategories);

        expect(result.error).toBeUndefined();
        expect(result.name).toBe('Blue Buffalo Chicken Dog Food 30 lb.');
        expect(result.brand).toBe('Blue Buffalo');
        expect(result.confidence_score).toBe(0.95);
    });

    it('returns validation errors if required fields are missing', () => {
        const invalidJson = JSON.stringify({
            name: 'Blue Buffalo Chicken Dog Food 30 lb.',
            brand: 'Blue Buffalo',
            weight: '30.00',
            confidence_score: 0.95,
            category: 'Dog > Food > Dry Food',
            description: '',
            search_keywords: 'dog, food, chicken, blue buffalo',
        });

        const result = parseStructuredConsolidationText('1234567890', invalidJson, validCategories);
        expect(result.error).toContain('Validation failed: description: Description is required');
    });

    it('returns validation errors if confidence score is out of bounds', () => {
        const invalidJson = JSON.stringify({
            name: 'Blue Buffalo Chicken Dog Food 30 lb.',
            brand: 'Blue Buffalo',
            weight: '30.00',
            confidence_score: 1.5, // Invalid: greater than 1
            category: 'Dog > Food > Dry Food',
            description: 'High-quality dry dog food.',
            search_keywords: 'dog, food, chicken, blue buffalo',
        });

        const result = parseStructuredConsolidationText('1234567890', invalidJson, validCategories);
        expect(result.error).toContain('Validation failed: confidence_score: Confidence score must be between 0.0 and 1.0');
    });
});
