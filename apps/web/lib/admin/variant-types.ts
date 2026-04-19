import type { ProductVariant } from '@/lib/types';

export interface VariantWithOptions extends ProductVariant {
  product?: {
    id: string;
    name: string;
  };
}
