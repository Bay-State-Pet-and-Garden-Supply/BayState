'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';
import { formatCurrency } from '@/lib/utils';

/**
 * StickyCart - Floating cart button for mobile devices.
 * Shows item count and links to cart page.
 */
export function StickyCart() {
  const itemCount = useCartStore((state) => state.getItemCount());
  const subtotal = useCartStore((state) => state.getSubtotal());

  if (itemCount === 0) {
    return null;
  }

  const formattedSubtotal = formatCurrency(subtotal);

  return (
    <Link
      href="/cart"
      className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-white shadow-lg transition-transform hover:scale-[1.02] md:hidden hover:underline underline-offset-4"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-zinc-900">
            {itemCount}
          </span>
        </div>
        <span className="font-medium">View Cart</span>
      </div>
      <span className="font-semibold">{formattedSubtotal}</span>
    </Link>
  );
}
