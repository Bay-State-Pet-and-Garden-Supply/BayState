/**
 * Supabase Database Types
 *
 * Generated types for the Supabase database schema.
 * To regenerate, run: npx supabase gen types typescript --project-id=<id> --schema=public > types/supabase.ts
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: {
            brands: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    logo_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    logo_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    logo_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            products: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    description: string | null;
                    sku: string | null;
                    price: number;
                    sale_price: number | null;
                    brand_id: string | null;
                    stock_qty: number;
                    stock_status: string;
                    is_featured: boolean;
                    is_active: boolean;
                    images: string[] | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    description?: string | null;
                    sku?: string | null;
                    price: number;
                    sale_price?: number | null;
                    brand_id?: string | null;
                    stock_qty?: number;
                    stock_status?: string;
                    is_featured?: boolean;
                    is_active?: boolean;
                    images?: string[] | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    description?: string | null;
                    sku?: string | null;
                    price?: number;
                    sale_price?: number | null;
                    brand_id?: string | null;
                    stock_qty?: number;
                    stock_status?: string;
                    is_featured?: boolean;
                    is_active?: boolean;
                    images?: string[] | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };
            services: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    description: string | null;
                    price: number;
                    unit: string | null;
                    is_active: boolean;
                    image_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    description?: string | null;
                    price: number;
                    unit?: string | null;
                    is_active?: boolean;
                    image_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    description?: string | null;
                    price?: number;
                    unit?: string | null;
                    is_active?: boolean;
                    image_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
    };
}
