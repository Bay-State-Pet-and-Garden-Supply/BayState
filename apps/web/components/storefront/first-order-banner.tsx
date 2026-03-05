'use client';

import { Gift } from 'lucide-react';
import Link from 'next/link';

interface FirstOrderBannerProps {
  code?: string;
  discount?: string;
  className?: string;
}

export function FirstOrderBanner({ 
  code = 'WELCOME', 
  discount = '$10 off',
  className = '' 
}: FirstOrderBannerProps) {
  return (
    <div className={`rounded-lg bg-gradient-to-r from-primary to-primary/80 p-4 text-white ${className}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-white/20 p-2">
          <Gift className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Welcome! Get {discount} your first order</p>
          <p className="text-sm text-white/90">
            Use code <span className="font-mono font-bold">{code}</span> at checkout
          </p>
        </div>
        <Link
          href="/products"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-primary hover:bg-white/90 transition-colors hover:underline underline-offset-4"
        >
          Shop Now
        </Link>
      </div>
    </div>
  );
}
