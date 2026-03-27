/**
 * Product Synchronization Utilities
 * 
 * Handles transformation and sync of products from ShopSite to Supabase.
 */

import { ShopSiteProduct } from './types';
import {
    normalizeBrandName,
    normalizeCategoryValue,
    normalizeProductTypeValue,
} from '@/lib/facets/normalization';

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
 * Outputs the canonical products schema used by publishToStorefront.
 */
export function transformShopSiteProduct(product: ShopSiteProduct): {
    sku: string;
    name: string;
    slug: string;
    price: number;
    description: string | null;
    stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
    images: string[];
    is_special_order: boolean;
    shopsite_pages: string[];
    weight: number | null;
    quantity: number;
    low_stock_threshold: number | null;
    is_taxable: boolean;
    gtin: string | null;
    availability: string | null;
    minimum_quantity: number;
    long_description: string | null;
    product_type: string | null;
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
        description: product.description || null,
        stock_status: stockStatus,
        images,
        is_special_order: !!product.isSpecialOrder,
        shopsite_pages: product.shopsitePages || [],
        weight: product.weight || null,
        quantity: product.quantityOnHand || 0,
        low_stock_threshold: product.lowStockThreshold ?? 5,
        is_taxable: !!product.taxable,
        gtin: product.gtin || null,
        availability: product.availability || null,
        minimum_quantity: Math.max(product.minimumQuantity ?? 0, 0),
        long_description: product.moreInfoText || null,
        product_type: normalizeProductTypeValue(product.productTypeName),
        search_keywords: product.searchKeywords || null,
        brand_name: normalizeBrandName(product.brandName),
        category_name: normalizeCategoryValue(product.categoryName),
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
