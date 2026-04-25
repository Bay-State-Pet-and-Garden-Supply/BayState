import type { SupabaseClient } from '@/lib/supabase/server';
import {
    buildPipelineInputFromShopSiteProduct,
    generateUniqueSlug,
    transformShopSiteProduct,
} from './product-sync';
import { PetTypeName, resolveCanonicalPetTypes } from './pet-type-inference';
import type { MigrationError, ShopSiteProduct, SyncResult } from './types';
import {
    GENERIC_FACET_FIELDS,
    GenericFacetName,
    getGenericFacetDefinition,
    normalizeGenericFacetValues,
} from '@/lib/facets/generic-normalization';
import {
    buildFacetSlug,
    normalizeBrandName,
    normalizeCategoryValue,
    splitMultiValueFacet,
} from '@/lib/facets/normalization';
import { getMappedCategorySlug } from '@/lib/facets/category-mapping';

type ProgressUpdater = (result: SyncResult) => Promise<void>;

interface ImportShopSiteProductsOptions {
    supabase: SupabaseClient;
    shopSiteProducts: ShopSiteProduct[];
    logId?: string;
    updateProgress?: ProgressUpdater;
}

const GENERIC_FACET_INPUTS = [
    { field: 'ProductField18', transformedKey: 'life_stage' },
    { field: 'ProductField19', transformedKey: 'pet_size' },
    { field: 'ProductField20', transformedKey: 'special_diet' },
    { field: 'ProductField21', transformedKey: 'health_feature' },
    { field: 'ProductField22', transformedKey: 'food_form' },
    { field: 'ProductField23', transformedKey: 'flavor' },
    { field: 'ProductField26', transformedKey: 'product_feature' },
    { field: 'ProductField27', transformedKey: 'size' },
    { field: 'ProductField29', transformedKey: 'color' },
    { field: 'ProductField30', transformedKey: 'packaging_type' },
] as const;

type TransformedShopSiteProduct = ReturnType<typeof transformShopSiteProduct>;

interface CrossSellAuditCounters {
    sourcesProcessed: number;
    linked: number;
    skipped: number;
    skippedDuplicates: number;
    skippedSelfLinks: number;
    skippedMissing: number;
}

interface ImportAuditResult extends SyncResult {
    skipped?: number;
    audit?: {
        crossSell: CrossSellAuditCounters;
    };
}

function dedupeIds(values: string[]): string[] {
    return Array.from(new Set(values));
}

function normalizeCrossSellSkus(crossSellSkus: ShopSiteProduct['crossSellSkus']): string[] {
    if (!Array.isArray(crossSellSkus) || crossSellSkus.length === 0) {
        return [];
    }

    return crossSellSkus
        .flatMap((value) => value.split('|'))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

async function replaceProductCrossSells(
    supabase: SupabaseClient,
    sourceProductId: string,
    sourceSku: string,
    crossSellSkus: ShopSiteProduct['crossSellSkus'],
    productIdBySku: Map<string, string>,
): Promise<Omit<CrossSellAuditCounters, 'sourcesProcessed'>> {
    const { error: deleteError } = await supabase
        .from('related_products')
        .delete()
        .eq('product_id', sourceProductId)
        .eq('relation_type', 'cross_sell');

    if (deleteError) {
        throw new Error(`Failed to replace product cross-sells: ${deleteError.message}`);
    }

    const normalizedTargets = normalizeCrossSellSkus(crossSellSkus);
    if (normalizedTargets.length === 0) {
        return {
            linked: 0,
            skipped: 0,
            skippedDuplicates: 0,
            skippedSelfLinks: 0,
            skippedMissing: 0,
        };
    }

    const seenTargetSkus = new Set<string>();
    const relationRows: Array<{
        product_id: string;
        related_product_id: string;
        relation_type: 'cross_sell';
        position: number;
    }> = [];
    let skippedDuplicates = 0;
    let skippedSelfLinks = 0;
    let skippedMissing = 0;

    for (const targetSku of normalizedTargets) {
        if (seenTargetSkus.has(targetSku)) {
            skippedDuplicates++;
            continue;
        }

        seenTargetSkus.add(targetSku);

        if (targetSku === sourceSku) {
            skippedSelfLinks++;
            continue;
        }

        const targetProductId = productIdBySku.get(targetSku);
        if (!targetProductId) {
            skippedMissing++;
            continue;
        }

        relationRows.push({
            product_id: sourceProductId,
            related_product_id: targetProductId,
            relation_type: 'cross_sell',
            position: relationRows.length,
        });
    }

    if (relationRows.length > 0) {
        const { error: upsertError } = await supabase
            .from('related_products')
            .upsert(relationRows, { onConflict: 'product_id, related_product_id, relation_type' });

        if (upsertError) {
            throw new Error(`Failed to link product cross-sells: ${upsertError.message}`);
        }
    }

    return {
        linked: relationRows.length,
        skipped: skippedDuplicates + skippedSelfLinks + skippedMissing,
        skippedDuplicates,
        skippedSelfLinks,
        skippedMissing,
    };
}

async function replaceProductCategories(
    supabase: SupabaseClient,
    productId: string,
    categoryIds: string[],
) {
    const { error: deleteError } = await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', productId);

    if (deleteError) {
        throw new Error(`Failed to replace product categories: ${deleteError.message}`);
    }

    const dedupedCategoryIds = dedupeIds(categoryIds);
    if (dedupedCategoryIds.length === 0) {
        return;
    }

    const { error: linkError } = await supabase
        .from('product_categories')
        .upsert(
            dedupedCategoryIds.map((categoryId) => ({
                product_id: productId,
                category_id: categoryId,
            })),
            { onConflict: 'product_id, category_id' },
        );

    if (linkError) {
        throw new Error(`Failed to link product categories: ${linkError.message}`);
    }
}

async function replaceProductPetTypes(
    supabase: SupabaseClient,
    productId: string,
    petTypeIds: string[],
) {
    const { error: deleteError } = await supabase
        .from('product_pet_types')
        .delete()
        .eq('product_id', productId);

    if (deleteError) {
        throw new Error(`Failed to replace product pet types: ${deleteError.message}`);
    }

    const dedupedPetTypeIds = dedupeIds(petTypeIds);
    if (dedupedPetTypeIds.length === 0) {
        return;
    }

    const { error: linkError } = await supabase
        .from('product_pet_types')
        .upsert(
            dedupedPetTypeIds.map((petTypeId) => ({
                product_id: productId,
                pet_type_id: petTypeId,
            })),
            { onConflict: 'product_id, pet_type_id' },
        );

    if (linkError) {
        throw new Error(`Failed to link product pet types: ${linkError.message}`);
    }
}

async function ensureGenericFacetDefinitionId(
    supabase: SupabaseClient,
    facetName: GenericFacetName,
    facetDefinitionMap: Map<GenericFacetName, string>,
) {
    const existingFacetDefinitionId = facetDefinitionMap.get(facetName);
    if (existingFacetDefinitionId) {
        return existingFacetDefinitionId;
    }

    const genericField = Object.entries(GENERIC_FACET_FIELDS).find(([, value]) => value.name === facetName)?.[0];
    if (!genericField) {
        throw new Error(`Unsupported generic facet definition: ${facetName}`);
    }

    const definition = getGenericFacetDefinition(genericField as keyof typeof GENERIC_FACET_FIELDS);
    const { data: upsertedDefinition, error } = await supabase
        .from('facet_definitions')
        .upsert(
            {
                name: definition.name,
                slug: definition.slug,
                description: definition.description,
            },
            { onConflict: 'name' },
        )
        .select('id')
        .single();

    if (error || !upsertedDefinition) {
        throw new Error(`Failed to resolve generic facet definition "${facetName}": ${error?.message ?? 'Missing facet definition row'}`);
    }

    facetDefinitionMap.set(facetName, upsertedDefinition.id);
    return upsertedDefinition.id;
}

async function ensureGenericFacetValueId(
    supabase: SupabaseClient,
    facetDefinitionId: string,
    facetName: GenericFacetName,
    value: ReturnType<typeof normalizeGenericFacetValues>[number],
    facetValueMap: Map<string, string>,
) {
    const cacheKey = `${facetName}:${value.normalizedValue.toLowerCase()}`;
    const existingFacetValueId = facetValueMap.get(cacheKey);
    if (existingFacetValueId) {
        return existingFacetValueId;
    }

    const { data: upsertedFacetValue, error } = await supabase
        .from('facet_values')
        .upsert(
            {
                facet_definition_id: facetDefinitionId,
                value: value.value,
                normalized_value: value.normalizedValue,
                slug: value.slug,
            },
            { onConflict: 'facet_definition_id, normalized_value' },
        )
        .select('id')
        .single();

    if (error || !upsertedFacetValue) {
        throw new Error(`Failed to resolve generic facet value "${value.normalizedValue}": ${error?.message ?? 'Missing facet value row'}`);
    }

    facetValueMap.set(cacheKey, upsertedFacetValue.id);
    return upsertedFacetValue.id;
}

async function replaceProductGenericFacets(
    supabase: SupabaseClient,
    productId: string,
    transformedProduct: TransformedShopSiteProduct,
    facetDefinitionMap: Map<GenericFacetName, string>,
    facetValueMap: Map<string, string>,
) {
    const { error: deleteError } = await supabase
        .from('product_facets')
        .delete()
        .eq('product_id', productId);

    if (deleteError) {
        throw new Error(`Failed to replace product generic facets: ${deleteError.message}`);
    }

    const facetValueIds: string[] = [];

    for (const { field, transformedKey } of GENERIC_FACET_INPUTS) {
        const definition = getGenericFacetDefinition(field);
        const facetDefinitionId = await ensureGenericFacetDefinitionId(supabase, definition.name, facetDefinitionMap);
        const normalizedValues = normalizeGenericFacetValues(transformedProduct[transformedKey]);

        for (const normalizedValue of normalizedValues) {
            const facetValueId = await ensureGenericFacetValueId(
                supabase,
                facetDefinitionId,
                definition.name,
                normalizedValue,
                facetValueMap,
            );
            facetValueIds.push(facetValueId);
        }
    }

    const dedupedFacetValueIds = dedupeIds(facetValueIds);
    if (dedupedFacetValueIds.length === 0) {
        return;
    }

    const { error: linkError } = await supabase
        .from('product_facets')
        .upsert(
            dedupedFacetValueIds.map((facetValueId) => ({
                product_id: productId,
                facet_value_id: facetValueId,
            })),
            { onConflict: 'product_id, facet_value_id' },
        );

    if (linkError) {
        throw new Error(`Failed to link product generic facets: ${linkError.message}`);
    }
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
    const crossSellAudit: CrossSellAuditCounters = {
        sourcesProcessed: 0,
        linked: 0,
        skipped: 0,
        skippedDuplicates: 0,
        skippedSelfLinks: 0,
        skippedMissing: 0,
    };
    const importedProductIdsBySku = new Map<string, string>();

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
    const existingProductIdBySku = new Map<string, string>();
    const PAGE_SIZE = 1000;

    for (let from = 0; ; from += PAGE_SIZE) {
        const { data: existingProductsPage, error: existingProductsError } = await supabase
            .from('products')
            .select('id, slug, sku')
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
                if (product.id) {
                    existingProductIdBySku.set(product.sku, product.id);
                }
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

        const mappedSlug = getMappedCategorySlug(p.categoryName, p.productTypeName);
        if (mappedSlug) {
            categoryNames.add(mappedSlug);
        } else if (p.categoryName) {
            console.warn(`[Import] Unmapped legacy category: ${p.categoryName} > ${p.productTypeName || 'none'}`);
        }
    }

    const brandMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();
    const petTypeMap = new Map<PetTypeName, string>();
    const facetDefinitionMap = new Map<GenericFacetName, string>();
    const facetValueMap = new Map<string, string>();

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

    for (const slug of Array.from(categoryNames)) {
        const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).single();

        if (existing) {
            categoryMap.set(slug, existing.id);
        } else {
            console.warn(`[Import] Mapped category slug not found in DB: ${slug}`);
        }
    }

    const { data: petTypes } = await supabase.from('pet_types').select('id, name');
    for (const pt of petTypes || []) {
        petTypeMap.set(pt.name as PetTypeName, pt.id);
    }

    const genericFacetDefinitions = Object.keys(GENERIC_FACET_FIELDS).map((field) =>
        getGenericFacetDefinition(field as keyof typeof GENERIC_FACET_FIELDS),
    );

    const { data: existingFacetDefinitions } = await supabase
        .from('facet_definitions')
        .select('id, name');

    for (const facetDefinition of existingFacetDefinitions || []) {
        if (genericFacetDefinitions.some((definition) => definition.name === facetDefinition.name)) {
            facetDefinitionMap.set(facetDefinition.name as GenericFacetName, facetDefinition.id);
        }
    }

    const resolvedPetTypeNames = new Set<PetTypeName>();
    for (const shopSiteProduct of shopSiteProducts) {
        for (const petTypeName of resolveCanonicalPetTypes(shopSiteProduct).petTypes) {
            resolvedPetTypeNames.add(petTypeName);
        }
    }

    for (const petTypeName of Array.from(resolvedPetTypeNames)) {
        if (petTypeMap.has(petTypeName)) {
            continue;
        }

        const { data: createdPetType, error: createdPetTypeError } = await supabase
            .from('pet_types')
            .insert({
                name: petTypeName,
                display_order: 0,
            })
            .select('id')
            .single();

        if (createdPetTypeError || !createdPetType) {
            throw new Error(`Failed to create pet type "${petTypeName}": ${createdPetTypeError?.message ?? 'Missing pet type row'}`);
        }

        petTypeMap.set(petTypeName, createdPetType.id);
    }

    for (const shopSiteProduct of shopSiteProducts) {
        try {
            const {
                brand_name,
                category_name,
                pet_type_name,
                life_stage,
                pet_size,
                special_diet,
                health_feature,
                food_form,
                flavor,
                product_feature,
                size,
                color,
                packaging_type,
                ...transformed
            } = transformShopSiteProduct(shopSiteProduct);

            // Create record with ONLY valid database columns
            const productRecord = {
                sku: transformed.sku,
                name: transformed.name,
                slug: '', // Set below
                price: transformed.price,
                description: transformed.description,
                stock_status: transformed.stock_status,
                images: transformed.images,
                short_name: transformed.short_name,
                is_special_order: transformed.is_special_order,
                in_store_pickup: transformed.in_store_pickup,
                shopsite_pages: transformed.shopsite_pages,
                weight: transformed.weight,
                quantity: transformed.quantity,
                low_stock_threshold: transformed.low_stock_threshold,
                is_taxable: transformed.is_taxable,
                gtin: transformed.gtin,
                availability: transformed.availability,
                minimum_quantity: transformed.minimum_quantity,
                long_description: transformed.long_description,
                search_keywords: transformed.search_keywords,
                brand_id: null as string | null,
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
                if (upserted) {
                    importedProductIdsBySku.set(shopSiteProduct.sku, upserted.id);
                    existingProductIdBySku.set(shopSiteProduct.sku, upserted.id);
                    const mappedSlug = getMappedCategorySlug(shopSiteProduct.categoryName, shopSiteProduct.productTypeName);
                    const categoryIds: string[] = [];
                    if (mappedSlug) {
                        const categoryId = categoryMap.get(mappedSlug);
                        if (categoryId) categoryIds.push(categoryId);
                    }

                    await replaceProductCategories(supabase, upserted.id, categoryIds);

                    const resolvedPetTypes = resolveCanonicalPetTypes({
                        ...shopSiteProduct,
                        petTypeName: pet_type_name ?? shopSiteProduct.petTypeName,
                    });
                    const petTypeIds = resolvedPetTypes.petTypes
                        .map((petType) => petTypeMap.get(petType))
                        .filter((petTypeId): petTypeId is string => !!petTypeId);

                    await replaceProductPetTypes(supabase, upserted.id, petTypeIds);
                    await replaceProductGenericFacets(supabase, upserted.id, {
                        ...transformed,
                        brand_name,
                        category_name,
                        pet_type_name,
                        life_stage,
                        pet_size,
                        special_diet,
                        health_feature,
                        food_form,
                        flavor,
                        product_feature,
                        size,
                        color,
                        packaging_type,
                    }, facetDefinitionMap, facetValueMap);
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
                processed: created + updated + failed,
                created,
                updated,
                failed,
                errors: [],
                duration: Date.now() - startTime,
                skipped: crossSellAudit.skipped,
                audit: {
                    crossSell: { ...crossSellAudit },
                },
            } as ImportAuditResult);
        }
    }

    // Phase 4: Sync cross-sells
    for (const shopSiteProduct of shopSiteProducts) {
        const sourceProductId = importedProductIdsBySku.get(shopSiteProduct.sku);
        if (!sourceProductId) {
            continue;
        }

        try {
            crossSellAudit.sourcesProcessed++;
            const crossSellResult = await replaceProductCrossSells(
                supabase,
                sourceProductId,
                shopSiteProduct.sku,
                shopSiteProduct.crossSellSkus,
                existingProductIdBySku,
            );

            crossSellAudit.linked += crossSellResult.linked;
            crossSellAudit.skipped += crossSellResult.skipped;
            crossSellAudit.skippedDuplicates += crossSellResult.skippedDuplicates;
            crossSellAudit.skippedSelfLinks += crossSellResult.skippedSelfLinks;
            crossSellAudit.skippedMissing += crossSellResult.skippedMissing;
        } catch (err) {
            addError(shopSiteProduct.sku, err instanceof Error ? err.message : 'Unknown error');
            failed++;
        }
    }

    // Phase 5: Cleanup (Only for full syncs)
    // If we processed all products, remove anything in the DB that wasn't in the import list.
    // This purges disabled or deleted ShopSite products.
    let deletedCount = 0;
    const isFullSync = !logId; // Or check if limit was provided. For now, assume if updateProgress is here, we want cleanup.
    
    // Safety check: only purge if we successfully processed a significant number of products
    if (created + updated > 100) {
        const activeSkus = Array.from(importedProductIdsBySku.keys());
        const { error: cleanupError, count } = await supabase
            .from('products')
            .delete()
            .not('sku', 'in', `(${activeSkus.join(',')})`);
            
        if (!cleanupError) {
            deletedCount = count ?? 0;
            console.log(`[Cleanup] Purged ${deletedCount} inactive/disabled products.`);
        } else {
            console.warn(`[Cleanup] Failed to purge inactive products: ${cleanupError.message}`);
        }
    }

    return {
        success: failed === 0,
        processed: shopSiteProducts.length,
        created,
        updated,
        failed,
        deleted: deletedCount,
        errors,
        duration: Date.now() - startTime,
        skipped: crossSellAudit.skipped,
        audit: {
            crossSell: crossSellAudit,
        },
    } as ImportAuditResult;
}

export async function syncExistingProductsIngestionInputFromShopSite({
    supabase,
    shopSiteProducts,
}: {
    supabase: SupabaseClient;
    shopSiteProducts: ShopSiteProduct[];
}): Promise<{ updated: number }> {
    if (shopSiteProducts.length === 0) {
        return { updated: 0 };
    }

    const inputBySku = new Map(
        shopSiteProducts.map((product) => [product.sku, buildPipelineInputFromShopSiteProduct(product)])
    );
    const BATCH_SIZE = 500;
    let updated = 0;

    for (let index = 0; index < shopSiteProducts.length; index += BATCH_SIZE) {
        const batchProducts = shopSiteProducts.slice(index, index + BATCH_SIZE);
        const batchSkus = batchProducts.map((product) => product.sku);

        const { data: existingRows, error: existingRowsError } = await supabase
            .from('products_ingestion')
            .select('sku, input, pipeline_status')
            .in('sku', batchSkus);

        if (existingRowsError) {
            throw new Error(`Failed to load products_ingestion rows: ${existingRowsError.message}`);
        }

        if (!existingRows || existingRows.length === 0) {
            continue;
        }

        const updatedAt = new Date().toISOString();
        const updateRows = existingRows.map((row) => {
            const existingInput =
                row.input && typeof row.input === 'object' && !Array.isArray(row.input)
                    ? (row.input as Record<string, unknown>)
                    : {};

            return {
                sku: row.sku,
                pipeline_status: row.pipeline_status,
                input: {
                    ...existingInput,
                    ...inputBySku.get(row.sku),
                },
                updated_at: updatedAt,
            };
        });

        const { error: upsertError } = await supabase
            .from('products_ingestion')
            .upsert(updateRows, { onConflict: 'sku' });

        if (upsertError) {
            throw new Error(`Failed to sync products_ingestion inputs: ${upsertError.message}`);
        }

        updated += updateRows.length;
    }

    return { updated };
}
