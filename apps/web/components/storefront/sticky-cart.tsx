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
      className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between rounded-sm bg-[oklch(25%_0.02_90)] px-4 py-3 text-white shadow-md transition-transform hover:-translate-y-0.5 md:hidden hover:underline underline-offset-4"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-[oklch(25%_0.02_90)]">
            {itemCount}
          </span>
        </div>
        <span className="font-medium">View Cart</span>
      </div>
      <span className="font-semibold">{formattedSubtotal}</span>
    </Link>
  );
}
