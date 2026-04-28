import { Brand } from "@/lib/types";

export type { Brand };

export interface BrandActionState {
  success: boolean;
  error?: string;
  brand?: Brand;
}
