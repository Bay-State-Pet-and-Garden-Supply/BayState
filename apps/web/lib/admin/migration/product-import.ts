import type { SupabaseClient } from '@supabase/supabase-js';
import { transformShopSiteProduct, generateUniqueSlug } from './product-sync';
import { inferPetTypes, PetTypeName } from './pet-type-inference';
import type { MigrationError, ShopSiteProduct, SyncResult } from './types';
import {
    buildFacetSlug,
    normalizeBrandName,
    normalizeCategoryValue,
    splitMultiValueFacet,
} from '@/lib/facets/normalization';

type ProgressUpdater = (result: SyncResult) => Promise<void>;

interface ImportShopSiteProductsOptions {
    supabase: SupabaseClient;
    shopSiteProducts: ShopSiteProduct[];
    logId?: string;
    updateProgress?: ProgressUpdater;
}

export async function importShopSiteProducts({
    supabase,
    shopSiteProducts,
    logId,
    updateProgress,
}: ImportShopSiteProductsOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const MAX_ERRORS = 50;
    const errors: MigrationError[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    const addError = (record: string, message: string) => {
        if (errors.length < MAX_ERRORS) {
            errors.push({
                record,
                error: message,
                timestamp: new Date().toISOString(),
            });
        }
    };

    if (shopSiteProducts.length === 0) {
        return {
            success: true,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [],
            duration: Date.now() - startTime,
        };
    }

    const existingSlugs = new Set<string>();
    const existingSkus = new Set<string>();
    const existingSlugBySku = new Map<string, string>();
    const PAGE_SIZE = 1000;

    for (let from = 0; ; from += PAGE_SIZE) {
        const { data: existingProductsPage, error: existingProductsError } = await supabase
            .from('products')
            .select('slug, sku')
            .range(from, from + PAGE_SIZE - 1);

        if (existingProductsError) {
            throw new Error(`Failed to preload existing products: ${existingProductsError.message}`);
        }

        if (!existingProductsPage || existingProductsPage.length === 0) {
            break;
        }

        for (const product of existingProductsPage) {
            if (product.slug) existingSlugs.add(product.slug);
            if (product.sku) {
                existingSkus.add(product.sku);
                if (product.slug) {
                    existingSlugBySku.set(product.sku, product.slug);
                }
            }
        }

        if (existingProductsPage.length < PAGE_SIZE) {
            break;
        }
    }

    const brandNames = new Set<string>();
    const categoryNames = new Set<string>();

    for (const p of shopSiteProducts) {
        const normalizedBrandName = normalizeBrandName(p.brandName);
        if (normalizedBrandName) {
            brandNames.add(normalizedBrandName);
        }

        const normalizedCategoryValue = normalizeCategoryValue(p.categoryName);
        if (normalizedCategoryValue) {
            splitMultiValueFacet(normalizedCategoryValue).forEach((categoryName) => categoryNames.add(categoryName));
        }
    }

    const brandMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();
    const petTypeMap = new Map<PetTypeName, string>();

    for (const name of Array.from(brandNames)) {
        const slug = buildFacetSlug(name);
        const { data: existing } = await supabase.from('brands').select('id').eq('slug', slug).single();

        if (existing) {
            brandMap.set(name, existing.id);
        } else {
            const { data: createdBrand } = await supabase.from('brands').insert({
                name,
                slug,
            }).select('id').single();

            if (createdBrand) brandMap.set(name, createdBrand.id);
        }
    }

    for (const name of Array.from(categoryNames)) {
        const slug = buildFacetSlug(name);
        const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).single();

        if (existing) {
            categoryMap.set(name, existing.id);
        } else {
            const { data: createdCategory } = await supabase.from('categories').insert({
                name,
                slug,
                display_order: 0,
            }).select('id').single();

            if (createdCategory) categoryMap.set(name, createdCategory.id);
        }
    }

    const { data: petTypes } = await supabase.from('pet_types').select('id, name');
    for (const pt of petTypes || []) {
        petTypeMap.set(pt.name as PetTypeName, pt.id);
    }

    const productCategoryLinks: { product_id: string, category_id: string }[] = [];
    const productPetTypeLinks: { product_id: string, pet_type_id: string }[] = [];

    for (const shopSiteProduct of shopSiteProducts) {
        try {
            const { brand_name, category_name, ...transformed } = transformShopSiteProduct(shopSiteProduct);
            const productRecord: Record<string, unknown> = {
                ...transformed,
                category: category_name || null,
            };

            if (brand_name) {
                const brandId = brandMap.get(brand_name);
                if (brandId) {
                    productRecord.brand_id = brandId;
                }
            }

            const isUpdate = existingSkus.has(shopSiteProduct.sku);

            if (isUpdate) {
                productRecord.slug = existingSlugBySku.get(shopSiteProduct.sku) ?? transformed.slug;
            } else {
                productRecord.slug = generateUniqueSlug(transformed.slug, existingSlugs);
                existingSlugs.add(productRecord.slug as string);
            }

            const { data: upserted, error } = await supabase
                .from('products')
                .upsert(productRecord, {
                    onConflict: 'sku',
                })
                .select('id')
                .single();

            if (error) {
                addError(shopSiteProduct.sku, error.message);
                failed++;
            } else {
                if (upserted && category_name) {
                    const cats = splitMultiValueFacet(category_name);
                    let primaryCategoryId: string | null = null;
                    for (const c of cats) {
                        const catId = categoryMap.get(c);
                        if (catId) {
                            if (!primaryCategoryId) {
                                primaryCategoryId = catId;
                            }
                            productCategoryLinks.push({
                                product_id: upserted.id,
                                category_id: catId,
                            });
                        }
                    }

                }

                if (upserted) {
                    const inference = inferPetTypes(shopSiteProduct);

                    for (const petTypeName of inference.petTypes) {
                        const petTypeId = petTypeMap.get(petTypeName);
                        if (petTypeId) {
                            productPetTypeLinks.push({
                                product_id: upserted.id,
                                pet_type_id: petTypeId,
                            });
                        }
                    }
                }

                if (isUpdate) {
                    updated++;
                } else {
                    created++;
                    existingSkus.add(shopSiteProduct.sku);
                }
            }
        } catch (err) {
            addError(shopSiteProduct.sku, err instanceof Error ? err.message : 'Unknown error');
            failed++;
        }

        if ((created + updated + failed) % 10 === 0 && logId && updateProgress) {
            await updateProgress({
                success: true,
                processed: shopSiteProducts.length,
                created,
                updated,
                failed,
                errors: [],
                duration: Date.now() - startTime,
            });
        }
    }

    if (productCategoryLinks.length > 0) {
        const dedupedProductCategoryLinks = Array.from(
            new Map(
                productCategoryLinks.map((link) => [`${link.product_id}:${link.category_id}`, link]),
            ).values(),
        );
        const BATCH_SIZE = 1000;
        for (let i = 0; i < dedupedProductCategoryLinks.length; i += BATCH_SIZE) {
            const batch = dedupedProductCategoryLinks.slice(i, i + BATCH_SIZE);
            const { error: linkError } = await supabase
                .from('product_categories')
                .upsert(batch, { onConflict: 'product_id, category_id' });

            if (linkError) {
                addError('CATEGORY_LINKS', `Failed to link ${batch.length} categories: ${linkError.message}`);
            }
        }
    }

    if (productPetTypeLinks.length > 0) {
        const dedupedProductPetTypeLinks = Array.from(
            new Map(
                productPetTypeLinks.map((link) => [`${link.product_id}:${link.pet_type_id}`, link]),
            ).values(),
        );
        const BATCH_SIZE = 1000;
        for (let i = 0; i < dedupedProductPetTypeLinks.length; i += BATCH_SIZE) {
            const batch = dedupedProductPetTypeLinks.slice(i, i + BATCH_SIZE);
            const { error: linkError } = await supabase
                .from('product_pet_types')
                .upsert(batch, { onConflict: 'product_id, pet_type_id' });

            if (linkError) {
                addError('PET_TYPE_LINKS', `Failed to link ${batch.length} pet types: ${linkError.message}`);
            }
        }
    }

    return {
        success: failed === 0,
        processed: shopSiteProducts.length,
        created,
        updated,
        failed,
        errors,
        duration: Date.now() - startTime,
    };
}
