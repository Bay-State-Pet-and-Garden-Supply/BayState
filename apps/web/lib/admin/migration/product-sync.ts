/**
 * Product Synchronization Utilities
 * 
 * Handles transformation and sync of products from ShopSite to Supabase.
 */

import { ShopSiteProduct } from './types';

/**
 * Generate a URL-friendly slug from a product name.
 * Optionally append SKU for uniqueness when needed.
 */
export function buildProductSlug(name: string, sku?: string): string {
    let slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-')          // Replace spaces with hyphens
        .replace(/-+/g, '-')           // Remove multiple consecutive hyphens
        .trim();

    if (sku) {
        slug = `${slug}-${sku.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
    }

    return slug;
}

/**
 * Transform a ShopSite product into the Supabase products table format.
 * Outputs minimal schema: sku, name, slug, price, description, stock_status, images, is_featured
 */
export function transformShopSiteProduct(product: ShopSiteProduct): {
    sku: string;
    name: string;
    slug: string;
    price: number;
    sale_price: number | null;
    description: string | null;
    stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
    images: string[];
    is_featured: boolean;
    is_special_order: boolean;
    weight: number | null;
    search_keywords: string | null;
    brand_name: string | null; // Used for brand lookup, not stored directly
    category_name: string | null; // Used for category lookup, not stored directly
} {
    // Collect all images (primary + additional)
    const images: string[] = [];
    if (product.imageUrl) {
        images.push(product.imageUrl);
    }
    if (product.additionalImages) {
        images.push(...product.additionalImages);
    }

    // Determine stock status based on quantity and availability
    let stockStatus: 'in_stock' | 'out_of_stock' | 'pre_order' = 'out_of_stock';
    if (product.isDisabled) {
        stockStatus = 'out_of_stock';
    } else if (product.quantityOnHand > 0) {
        stockStatus = 'in_stock';
    } else if (product.availability?.toLowerCase() === 'in stock') {
        stockStatus = 'in_stock';
    } else if (product.availability?.toLowerCase().includes('pre')) {
        stockStatus = 'pre_order';
    }

    return {
        sku: product.sku,
        name: product.name,
        slug: buildProductSlug(product.name),
        price: product.price,
        sale_price: product.saleAmount || null,
        description: product.description || null,
        stock_status: stockStatus,
        images,
        is_featured: false, // Default, can be updated in admin
        is_special_order: !!product.isSpecialOrder,
        weight: product.weight || null,
        search_keywords: product.searchKeywords || null,
        brand_name: product.brandName || null,
        category_name: product.categoryName || null,
    };
}

/**
 * Generate a unique slug by appending a counter if the base slug exists.
 */
export function generateUniqueSlug(baseSlug: string, existingSlugs: Set<string>): string {
    if (!existingSlugs.has(baseSlug)) {
        return baseSlug;
    }

    let counter = 1;
    let uniqueSlug = `${baseSlug}-${counter}`;
    while (existingSlugs.has(uniqueSlug)) {
        counter++;
        uniqueSlug = `${baseSlug}-${counter}`;
    }

    return uniqueSlug;
}
