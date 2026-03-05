import { act, renderHook } from '@testing-library/react';

// We need to mock localStorage for the persist middleware
const localStorageMock = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

import { useCartStore } from '@/lib/cart-store';

describe('Cart Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useCartStore());
    act(() => {
      result.current.clearCart();
    });
  });

  describe('addItem', () => {
    it('adds new item to cart', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].name).toBe('Test Product');
      expect(result.current.items[0].quantity).toBe(1);
    });

    it('increments quantity when adding existing item', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].quantity).toBe(2);
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
        result.current.removeItem('1');
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe('updateQuantity', () => {
    it('updates item quantity', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
        result.current.updateQuantity('1', 5);
      });

      expect(result.current.items[0].quantity).toBe(5);
    });

    it('removes item when quantity is 0 or less', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Test Product',
          slug: 'test-product',
          price: 29.99,
          imageUrl: null,
        });
        result.current.updateQuantity('1', 0);
      });

      expect(result.current.items).toHaveLength(0);
    });
  });

  describe('getItemCount', () => {
    it('returns total item count', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Product 1',
          slug: 'product-1',
          price: 10,
          imageUrl: null,
        });
        result.current.addItem({
          id: '2',
          name: 'Product 2',
          slug: 'product-2',
          price: 20,
          imageUrl: null,
        });
        result.current.updateQuantity('1', 3);
      });

      expect(result.current.getItemCount()).toBe(4); // 3 + 1
    });
  });

  describe('getSubtotal', () => {
    it('calculates correct subtotal', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Product 1',
          slug: 'product-1',
          price: 10,
          imageUrl: null,
        });
        result.current.addItem({
          id: '2',
          name: 'Product 2',
          slug: 'product-2',
          price: 25,
          imageUrl: null,
        });
        result.current.updateQuantity('1', 2);
      });

      expect(result.current.getSubtotal()).toBe(45); // (10 * 2) + (25 * 1)
    });
  });

  describe('clearCart', () => {
    it('removes all items', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Product 1',
          slug: 'product-1',
          price: 10,
          imageUrl: null,
        });
        result.current.addItem({
          id: '2',
          name: 'Product 2',
          slug: 'product-2',
          price: 20,
          imageUrl: null,
        });
        result.current.clearCart();
      });

      expect(result.current.items).toHaveLength(0);
    });

    it('also clears promo code', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.applyPromoCode('TEST10', 10, 'fixed_amount', 'promo-123');
        result.current.clearCart();
      });

      expect(result.current.promo.code).toBeNull();
      expect(result.current.promo.discount).toBe(0);
    });
  });

  describe('promo codes', () => {
    it('applies promo code correctly', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.applyPromoCode('SUMMER20', 15, 'percentage', 'promo-456');
      });

      expect(result.current.promo.code).toBe('SUMMER20');
      expect(result.current.promo.discount).toBe(15);
      expect(result.current.promo.discountType).toBe('percentage');
      expect(result.current.promo.promoCodeId).toBe('promo-456');
    });

    it('clears promo code', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.applyPromoCode('TEST', 10, 'fixed_amount', 'promo-123');
        result.current.clearPromoCode();
      });

      expect(result.current.promo.code).toBeNull();
      expect(result.current.promo.discount).toBe(0);
      expect(result.current.promo.discountType).toBeNull();
    });

    it('calculates discount correctly', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.addItem({
          id: '1',
          name: 'Product',
          slug: 'product',
          price: 50,
          imageUrl: null,
        });
        result.current.applyPromoCode('SAVE10', 10, 'fixed_amount', 'promo-789');
      });

      expect(result.current.getSubtotal()).toBe(50);
      expect(result.current.getDiscount()).toBe(10);
      expect(result.current.getTotal()).toBe(40);
    });

    it('detects free shipping promo', () => {
      const { result } = renderHook(() => useCartStore());

      act(() => {
        result.current.applyPromoCode('FREESHIP', 0, 'free_shipping', 'promo-free');
      });

      expect(result.current.hasFreeShipping()).toBe(true);
    });
  });
});
