'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/lib/cart-store';

export function CartStoreHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);

  return null;
}
