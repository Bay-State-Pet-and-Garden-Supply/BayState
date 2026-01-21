import { groupCartByBatch } from '@/lib/storefront/fulfillment';
import type { PreorderBatch, PreorderGroup } from '@/lib/types';
import type { CartItem } from '@/lib/cart-store';

describe('Preorder Grouping', () => {
  describe('groupCartByBatch', () => {
    const mockGroups: Map<string, PreorderGroup> = new Map([
      ['group-1', {
        id: 'group-1',
        name: 'Chicken Feed Preorder',
        slug: 'chicken-feed',
        description: null,
        minimum_quantity: 10,
        pickup_only: true,
        display_copy: 'Order early for spring delivery',
        is_active: true,
        created_at: '',
        updated_at: '',
      }],
      ['group-2', {
        id: 'group-2',
        name: 'Pet Bed Bulk Order',
        slug: 'pet-bed-bulk',
        description: null,
        minimum_quantity: 5,
        pickup_only: false,
        display_copy: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      }],
    ]);

    const mockBatches: Map<string, PreorderBatch> = new Map([
      ['batch-1', {
        id: 'batch-1',
        preorder_group_id: 'group-1',
        arrival_date: '2025-03-15',
        ordering_deadline: '2025-03-01',
        capacity: 100,
        display_order: 1,
        is_active: true,
        created_at: '',
        updated_at: '',
      }],
      ['batch-2', {
        id: 'batch-2',
        preorder_group_id: 'group-1',
        arrival_date: '2025-04-01',
        ordering_deadline: '2025-03-20',
        capacity: 150,
        display_order: 2,
        is_active: true,
        created_at: '',
        updated_at: '',
      }],
      ['batch-3', {
        id: 'batch-3',
        preorder_group_id: 'group-2',
        arrival_date: '2025-03-20',
        ordering_deadline: '2025-03-10',
        capacity: null,
        display_order: 1,
        is_active: true,
        created_at: '',
        updated_at: '',
      }],
    ]);

    const mockProductGroupMap: Map<string, string> = new Map([
      ['product-1', 'group-1'],
      ['product-2', 'group-1'],
      ['product-3', 'group-2'],
      ['product-4', 'group-2'],
    ]);

    it('groups items with batch IDs together', () => {
      const items: CartItem[] = [
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 3, preorderBatchId: 'batch-1' },
        { id: 'product-2', name: 'Product 2', slug: 'p2', price: 15, quantity: 2, preorderBatchId: 'batch-1' },
        { id: 'product-3', name: 'Product 3', slug: 'p3', price: 20, quantity: 4, preorderBatchId: 'batch-3' },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      // Should have 2 groups: batch-1 and batch-3
      expect(result).toHaveLength(2);

      const batch1Group = result.find(g => g.batchId === 'batch-1');
      expect(batch1Group).toBeDefined();
      expect(batch1Group!.items).toHaveLength(2);
      expect(batch1Group!.totalQuantity).toBe(5); // 3 + 2
      expect(batch1Group!.minimumQuantity).toBe(10); // group-1 minimum
      expect(batch1Group!.group).toBe(mockGroups.get('group-1'));

      const batch3Group = result.find(g => g.batchId === 'batch-3');
      expect(batch3Group).toBeDefined();
      expect(batch3Group!.items).toHaveLength(1);
      expect(batch3Group!.totalQuantity).toBe(4);
      expect(batch3Group!.minimumQuantity).toBe(5); // group-2 minimum
    });

    it('creates standard group for items without batch IDs', () => {
      const items: CartItem[] = [
        { id: 'product-5', name: 'Regular Product', slug: 'regular', price: 25, quantity: 2, preorderBatchId: null },
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 3, preorderBatchId: 'batch-1' },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      // Should have 2 groups: standard and batch-1
      expect(result).toHaveLength(2);

      const standardGroup = result.find(g => g.batchId === 'standard');
      expect(standardGroup).toBeDefined();
      expect(standardGroup!.items).toHaveLength(1);
      expect(standardGroup!.totalQuantity).toBe(2);
      expect(standardGroup!.minimumQuantity).toBe(1); // Default minimum for standard items
      expect(standardGroup!.group).toBeUndefined();
    });

    it('handles empty cart', () => {
      const result = groupCartByBatch([], mockProductGroupMap, mockBatches, mockGroups);
      expect(result).toHaveLength(0);
    });

    it('handles mixed items with and without preorder groups', () => {
      const items: CartItem[] = [
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 3, preorderBatchId: 'batch-1' },
        { id: 'product-5', name: 'Regular Product', slug: 'regular', price: 25, quantity: 2, preorderBatchId: null },
        { id: 'product-3', name: 'Product 3', slug: 'p3', price: 20, quantity: 4, preorderBatchId: 'batch-3' },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      expect(result).toHaveLength(3);
      expect(result.find(g => g.batchId === 'standard')).toBeDefined();
      expect(result.find(g => g.batchId === 'batch-1')).toBeDefined();
      expect(result.find(g => g.batchId === 'batch-3')).toBeDefined();
    });

    it('calculates correct totals for multiple items in same batch', () => {
      const items: CartItem[] = [
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 5, preorderBatchId: 'batch-1' },
        { id: 'product-2', name: 'Product 2', slug: 'p2', price: 20, quantity: 3, preorderBatchId: 'batch-1' },
        { id: 'product-3', name: 'Product 3', slug: 'p3', price: 15, quantity: 2, preorderBatchId: 'batch-1' },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      const batch1Group = result.find(g => g.batchId === 'batch-1')!;
      expect(batch1Group.totalQuantity).toBe(10); // 5 + 3 + 2
    });

    it('handles products with group assignment but no batch ID', () => {
      const items: CartItem[] = [
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 5, preorderBatchId: null },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      // Without a batch ID, it goes to 'standard' even if assigned to a group
      const standardGroup = result.find(g => g.batchId === 'standard');
      expect(standardGroup).toBeDefined();
      expect(standardGroup!.items).toHaveLength(1);
    });

    it('handles unknown batch IDs gracefully', () => {
      const items: CartItem[] = [
        { id: 'product-1', name: 'Product 1', slug: 'p1', price: 10, quantity: 3, preorderBatchId: 'unknown-batch' },
      ];

      const result = groupCartByBatch(items, mockProductGroupMap, mockBatches, mockGroups);

      const unknownGroup = result.find(g => g.batchId === 'unknown-batch');
      expect(unknownGroup).toBeDefined();
      expect(unknownGroup!.batch).toBeUndefined();
      expect(unknownGroup!.group).toBeUndefined();
      expect(unknownGroup!.minimumQuantity).toBe(1);
    });
  });
});
