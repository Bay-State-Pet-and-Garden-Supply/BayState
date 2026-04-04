/**
 * Product Synchronization Utilities
 * 
 * Handles transformation and sync of products from ShopSite to Supabase.
 */

import { ShopSiteProduct } from './types';
import { normalizePetTypeValue } from './pet-type-inference';
import {
    normalizeGenericFacetValue,
} from '@/lib/facets/generic-normalization';
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
    short_name: string | null;
    is_special_order: boolean;
    in_store_pickup: boolean;
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
    pet_type_name: string | null; // Used for pet-type lookup, not stored directly
    life_stage: string | null; // Used for generic facet lookup, not stored directly
    pet_size: string | null; // Used for generic facet lookup, not stored directly
    special_diet: string | null; // Used for generic facet lookup, not stored directly
    health_feature: string | null; // Used for generic facet lookup, not stored directly
    food_form: string | null; // Used for generic facet lookup, not stored directly
    flavor: string | null; // Used for generic facet lookup, not stored directly
    category_name: string | null; // Used for category lookup, not stored directly
    product_feature: string | null; // Used for generic facet lookup, not stored directly
    size: string | null; // Used for generic facet lookup, not stored directly
    color: string | null; // Used for generic facet lookup, not stored directly
    packaging_type: string | null; // Used for generic facet lookup, not stored directly
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
        short_name: product.shortName?.trim() || null,
        is_special_order: !!product.isSpecialOrder,
        in_store_pickup: !!product.inStorePickup,
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
        pet_type_name: normalizePetTypeValue(product.petTypeName),
        life_stage: normalizeGenericFacetValue(product.lifeStage),
        pet_size: normalizeGenericFacetValue(product.petSize),
        special_diet: normalizeGenericFacetValue(product.specialDiet),
        health_feature: normalizeGenericFacetValue(product.healthFeature),
        food_form: normalizeGenericFacetValue(product.foodForm),
        flavor: normalizeGenericFacetValue(product.flavor),
        category_name: normalizeCategoryValue(product.categoryName),
        product_feature: normalizeGenericFacetValue(product.productFeature),
        size: normalizeGenericFacetValue(product.size),
        color: normalizeGenericFacetValue(product.color),
        packaging_type: normalizeGenericFacetValue(product.packagingType),
    };
}

export interface ShopSitePipelineInput {
    name: string;
    price: number;
    product_on_pages: string[];
    description?: string | null;
    long_description?: string | null;
    short_name?: string | null;
    category?: string | null;
    product_type?: string | null;
    brand?: string | null;
    pet_type?: string | null;
    lifestage?: string | null;
    pet_size?: string | null;
    special_diet?: string | null;
    health_feature?: string | null;
    food_form?: string | null;
    flavor?: string | null;
    product_feature?: string | null;
    size?: string | null;
    color?: string | null;
    packaging_type?: string | null;
    weight?: string | null;
    search_keywords?: string | null;
    gtin?: string | null;
    availability?: string | null;
    minimum_quantity?: number;
    is_special_order?: boolean;
    in_store_pickup?: boolean;
    is_taxable?: boolean;
}

function formatOptionalNumber(value: number | null): string | undefined {
    if (value === null || Number.isNaN(value)) {
        return undefined;
    }

    return String(value);
}

export function buildPipelineInputFromTransformedShopSiteProduct(
    transformed: ReturnType<typeof transformShopSiteProduct>
): ShopSitePipelineInput {
    const input: ShopSitePipelineInput = {
        name: transformed.name,
        price: transformed.price,
        product_on_pages: transformed.shopsite_pages,
        description: transformed.description,
        long_description: transformed.long_description,
        short_name: transformed.short_name,
        category: transformed.category_name,
        product_type: transformed.product_type,
        brand: transformed.brand_name,
        pet_type: transformed.pet_type_name,
        lifestage: transformed.life_stage,
        pet_size: transformed.pet_size,
        special_diet: transformed.special_diet,
        health_feature: transformed.health_feature,
        food_form: transformed.food_form,
        flavor: transformed.flavor,
        product_feature: transformed.product_feature,
        size: transformed.size,
        color: transformed.color,
        packaging_type: transformed.packaging_type,
        weight: formatOptionalNumber(transformed.weight) ?? null,
        search_keywords: transformed.search_keywords,
        gtin: transformed.gtin,
        availability: transformed.availability,
        minimum_quantity: transformed.minimum_quantity,
        is_special_order: transformed.is_special_order,
        in_store_pickup: transformed.in_store_pickup,
        is_taxable: transformed.is_taxable,
    };

    return input;
}

export function buildPipelineInputFromShopSiteProduct(product: ShopSiteProduct): ShopSitePipelineInput {
    return buildPipelineInputFromTransformedShopSiteProduct(transformShopSiteProduct(product));
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
