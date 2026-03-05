import { convertWeightToPounds } from '@/lib/consolidation/result-normalizer';

describe('convertWeightToPounds', () => {
    it('converts ounces to pounds - "16 oz" → "1.00"', () => {
        expect(convertWeightToPounds('16 oz')).toBe('1.00');
    });

    it('converts pounds directly - "5 lb" → "5.00"', () => {
        expect(convertWeightToPounds('5 lb')).toBe('5.00');
    });

    it('converts pounds and ounces combined - "1 lb 8 oz" → "1.50"', () => {
        expect(convertWeightToPounds('1 lb 8 oz')).toBe('1.50');
    });

    it('converts grams to pounds - "500 g" → "1.10"', () => {
        expect(convertWeightToPounds('500 g')).toBe('1.10');
    });

    it('returns null for N/A - "N/A" → null', () => {
        expect(convertWeightToPounds('N/A')).toBeNull();
    });

    it('returns null for empty string - "" → null', () => {
        expect(convertWeightToPounds('')).toBeNull();
    });

    it('returns null for invalid input - "invalid" → null', () => {
        expect(convertWeightToPounds('invalid')).toBeNull();
    });
});
