import { chunk, parseNumericOrderNumber } from '@/lib/admin/migration/shopsite-order-sync-utils';

describe('shopsite order sync utils', () => {
    it('parses numeric order numbers only', () => {
        expect(parseNumericOrderNumber('12345')).toBe(12345);
        expect(parseNumericOrderNumber(' 0099 ')).toBe(99);
        expect(parseNumericOrderNumber('INT-123')).toBeNull();
        expect(parseNumericOrderNumber('12A3')).toBeNull();
        expect(parseNumericOrderNumber('')).toBeNull();
        expect(parseNumericOrderNumber(null)).toBeNull();
    });

    it('chunks arrays predictably', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([], 3)).toEqual([]);
    });
});
