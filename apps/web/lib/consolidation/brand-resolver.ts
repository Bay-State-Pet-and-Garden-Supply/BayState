/**
 * Brand Resolver for Product Consolidation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFacetSlug, canonicalizeBrandName, normalizeBrandName } from '@/lib/facets/normalization';

/**
 * Normalize lookup key by converting to lowercase, trimming, and removing non-alphanumeric characters.
 */
export function normalizeLookupKey(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

/**
 * Clean brand label from LLM output.
 */
export function cleanBrandLabel(rawBrandName: unknown): string | undefined {
    return typeof rawBrandName === 'string' && rawBrandName.trim().length > 0
        ? rawBrandName.trim().replace(/^brand\s*:\s*/i, '').trim()
        : undefined;
}

export interface BrandResolutionResult {
    brandId?: string;
    brandName?: string;
}

export interface BrandResolver {
    resolveBrand(rawBrandName: string | undefined): Promise<BrandResolutionResult>;
    getBrandNameById(id: string): string | undefined;
}

/**
 * Creates an instance of BrandResolver that caches existing brands and inserts new ones.
 */
export async function createBrandResolver(supabase: SupabaseClient): Promise<BrandResolver> {
    const { data: brands, error: brandsError } = await supabase
        .from('brands')
        .select('id, name, slug');

    if (brandsError) {
        throw new Error(`Failed to load brands: ${brandsError.message}`);
    }

    const brandNameById = new Map<string, string>();
    const brandIdByName = new Map<string, string>();
    const brandIdBySlug = new Map<string, string>();
    const brandIdByCanonical = new Map<string, string>();

    for (const brand of brands || []) {
        if (typeof brand.name === 'string' && typeof brand.id === 'string') {
            brandNameById.set(brand.id, brand.name);
            brandIdByName.set(normalizeLookupKey(brand.name), brand.id);
            const canonicalKey = canonicalizeBrandName(brand.name);
            if (canonicalKey && !brandIdByCanonical.has(canonicalKey)) {
                brandIdByCanonical.set(canonicalKey, brand.id);
            }

            const brandSlug =
                typeof brand.slug === 'string' && brand.slug.length > 0
                    ? brand.slug
                    : buildFacetSlug(brand.name);
            if (brandSlug) {
                brandIdBySlug.set(brandSlug, brand.id);
            }
        }
    }

    const getBrandNameById = (id: string): string | undefined => {
        return brandNameById.get(id);
    };

    const resolveBrand = async (
        rawBrandName: string | undefined
    ): Promise<BrandResolutionResult> => {
        const normalizedBrand = normalizeBrandName(rawBrandName);
        if (!normalizedBrand) {
            return {};
        }

        const lookupKey = normalizeLookupKey(normalizedBrand);
        const canonicalKey = canonicalizeBrandName(normalizedBrand);

        const existingBrandId =
            brandIdByName.get(lookupKey) || (canonicalKey ? brandIdByCanonical.get(canonicalKey) : undefined);

        if (existingBrandId) {
            return {
                brandId: existingBrandId,
                brandName: brandNameById.get(existingBrandId),
            };
        }

        const slug = buildFacetSlug(normalizedBrand);
        if (!slug) {
            throw new Error(`Invalid brand name: "${normalizedBrand}"`);
        }

        const existingBrandIdBySlug = brandIdBySlug.get(slug);
        if (existingBrandIdBySlug) {
            brandIdByName.set(lookupKey, existingBrandIdBySlug);
            return {
                brandId: existingBrandIdBySlug,
                brandName: brandNameById.get(existingBrandIdBySlug),
            };
        }

        const { data: createdBrand, error: createBrandError } = await supabase
            .from('brands')
            .insert({
                name: normalizedBrand,
                slug,
            })
            .select('id')
            .single();

        const createdBrandId = createdBrand?.id;
        if (typeof createdBrandId === 'string' && createdBrandId.length > 0) {
            brandIdByName.set(lookupKey, createdBrandId);
            brandIdBySlug.set(slug, createdBrandId);
            brandNameById.set(createdBrandId, normalizedBrand);
            return {
                brandId: createdBrandId,
                brandName: normalizedBrand,
            };
        }

        const { data: existingBrand, error: existingBrandError } = await supabase
            .from('brands')
            .select('id, name')
            .eq('slug', slug)
            .maybeSingle();

        const existingBrandIdAfterInsert = existingBrand?.id;
        if (typeof existingBrandIdAfterInsert === 'string' && existingBrandIdAfterInsert.length > 0) {
            brandIdByName.set(lookupKey, existingBrandIdAfterInsert);
            brandIdBySlug.set(slug, existingBrandIdAfterInsert);
            if (existingBrand.name) {
                brandNameById.set(existingBrandIdAfterInsert, existingBrand.name);
            }
            return {
                brandId: existingBrandIdAfterInsert,
                brandName: existingBrand.name || normalizedBrand,
            };
        }

        const details = [
            createBrandError?.message ? `create failed: ${createBrandError.message}` : null,
            existingBrandError?.message ? `lookup failed: ${existingBrandError.message}` : null,
        ]
            .filter(Boolean)
            .join('; ');

        throw new Error(`Failed to resolve brand "${normalizedBrand}"${details ? ` (${details})` : ''}`);
    };

    return { resolveBrand, getBrandNameById };
}
