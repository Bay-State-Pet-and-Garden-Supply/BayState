import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  preorderBatchId?: string | null;
  pickup_only?: boolean;
}

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';

interface PromoState {
  code: string | null;
  discount: number;
  discountType: DiscountType | null;
  promoCodeId: string | null;
}

interface CartState {
  items: CartItem[];
  promo: PromoState;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getSubtotal: () => number;
  applyPromoCode: (code: string, discount: number, discountType: DiscountType, promoCodeId: string) => void;
  clearPromoCode: () => void;
  getDiscount: () => number;
  getTotal: () => number;
  hasFreeShipping: () => boolean;
}

const initialPromoState: PromoState = {
  code: null,
  discount: 0,
  discountType: null,
  promoCodeId: null,
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      promo: initialPromoState,

      addItem: (item) => {
        set((state) => {
          const existingItem = state.items.find((i) => i.id === item.id);
          if (existingItem) {
            return {
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return {
            items: [...state.items, { ...item, quantity: 1 }],
          };
        });
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        }));
      },

      clearCart: () => {
        set({ items: [], promo: initialPromoState });
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
      },

      applyPromoCode: (code, discount, discountType, promoCodeId) => {
        set({
          promo: {
            code,
            discount,
            discountType,
            promoCodeId,
          },
        });
      },

      clearPromoCode: () => {
        set({ promo: initialPromoState });
      },

      getDiscount: () => {
        const { promo } = get();
        if (!promo.code) return 0;
        return promo.discount;
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const discount = get().getDiscount();
        return Math.max(0, subtotal - discount);
      },

      hasFreeShipping: () => {
        const { promo } = get();
        return promo.discountType === 'free_shipping';
      },
    }),
    {
      name: 'bay-state-cart',
    }
  )
);
