'use client';

import { useEffect, startTransition } from 'react';
import { trackProductView } from '@/lib/storefront/recently-viewed';

interface ProductViewTrackerProps {
  productId: string;
}

export function ProductViewTracker({ productId }: ProductViewTrackerProps) {
  useEffect(() => {
    startTransition(() => {
      trackProductView(productId);
    });
  }, [productId]);

  return null;
}
