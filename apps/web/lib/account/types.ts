import type { Database } from '@/types/supabase'

export type Address = Database['public']['Tables']['addresses']['Row']

export type ProductSummary = Pick<
    Database['public']['Tables']['products']['Row'],
    'id' | 'name' | 'slug' | 'price' | 'images' | 'stock_status'
>

export interface FrequentProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: string[];
    order_count: number;
}
