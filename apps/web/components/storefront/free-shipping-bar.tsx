'use client';

import { Truck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface FreeShippingBarProps {
  subtotal: number;
  threshold?: number;
  className?: string;
}

const FREE_SHIPPING_THRESHOLD = 49;

export function FreeShippingBar({ 
  subtotal, 
  threshold = FREE_SHIPPING_THRESHOLD,
  className = '' 
}: FreeShippingBarProps) {
  const remaining = threshold - subtotal;
  const progress = Math.min((subtotal / threshold) * 100, 100);
  const qualified = remaining <= 0;

  if (qualified) {
    return (
      <div className={`rounded-lg bg-green-50 p-3 ${className}`}>
        <div className="flex items-center gap-2 text-green-700">
          <Truck className="h-5 w-5" />
          <span className="font-medium">You qualify for FREE shipping!</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg bg-amber-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-amber-800">
          <Truck className="h-4 w-4" />
          <span>
            Add <span className="font-semibold">{formatCurrency(remaining)}</span> more for FREE shipping
          </span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
