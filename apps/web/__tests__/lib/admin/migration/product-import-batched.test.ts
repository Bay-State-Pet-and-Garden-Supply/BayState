import { dedupeProductsByUpc } from '@/lib/admin/migration/product-import-batched';
import type { ShopSiteProduct } from '@/lib/admin/migration/types';

describe('dedupeProductsByUpc', () => {
    it('keeps one record per UPC and counts duplicates', () => {
        const { deduped, duplicateCount } = dedupeProductsByUpc([
            { upc: 'A', name: 'first' } as unknown as ShopSiteProduct,
            { upc: 'B', name: 'second' } as unknown as ShopSiteProduct,
            { upc: 'A', name: 'last-a' } as unknown as ShopSiteProduct,
        ]);

        expect(duplicateCount).toBe(1);
        expect(deduped).toHaveLength(2);
        expect(deduped.find((product) => product.upc === 'A')?.name).toBe('last-a');
    });
});
