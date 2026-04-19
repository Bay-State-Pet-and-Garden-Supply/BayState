import type { ProductReview } from '@/lib/types';

export interface ReviewWithProduct extends ProductReview {
  product: {
    id: string;
    name: string;
    slug: string;
  } | null;
}
