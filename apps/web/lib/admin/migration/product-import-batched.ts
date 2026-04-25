import type { SupabaseClient } from '@/lib/supabase/server';
import {
    buildPipelineInputFromShopSiteProduct,
    generateUniqueSlug,
    transformShopSiteProduct,
} from './product-sync';
import { resolveCanonicalPetTypes } from './pet-type-inference';
import type { ShopSiteProduct } from './types';
import {
    type GenericFacetField,
    type GenericFacetName,
    getGenericFacetDefinition,
    normalizeGenericFacetValues,
} from '@/lib/facets/generic-normalization';
import { splitMultiValueFacet } from '@/lib/facets/normalization';
import { getMappedCategorySlug } from '@/lib/facets/category-mapping';

interface BatchImportOptions {
    supabase: SupabaseClient;
    shopSiteProducts: ShopSiteProduct[];
    logProgress?: (processed: number, total: number) => Promise<void>;
}

interface BatchImportResult {
    success: boolean;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    errors: Array<{ sku: string; error: string }>;
    crossSellStats: {
        linked: number;
        skippedDuplicates: number;
        skippedSelfLinks: number;
        skippedMissing: number;
    };
}

const BATCH_SIZE = 100;

type TransformedShopSiteProduct = ReturnType<typeof transformShopSiteProduct>;
type SuccessfulTransformedProduct = {
    product: ShopSiteProduct;
    transformed: TransformedShopSiteProduct;
    success: true;
};
type GenericFacetInputKey = keyof Pick<
    TransformedShopSiteProduct,
    | 'life_stage'
    | 'pet_size'
    | 'special_diet'
    | 'health_feature'
    | 'food_form'
    | 'flavor'
    | 'product_feature'
    | 'size'
    | 'color'
    | 'packaging_type'
>;

export async function importShopSiteProductsBatched({
    supabase,
    shopSiteProducts,
    logProgress,
}: BatchImportOptions): Promise<BatchImportResult> {
    const startTime = Date.now();
    const errors: Array<{ sku: string; error: string }> = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    console.log(`[Batch Import] Starting import of ${shopSiteProducts.length} products...`);

    // Phase 1: Pre-load all reference data into memory
    console.log('[Batch Import] Phase 1: Loading reference data...');
    const {
        existingSkus,
        existingSlugs,
        slugBySku,
        brandMap,
        categoryMap,
        petTypeMap,
        facetDefinitionMap,
        facetValueMap,
        productIdBySku,
    } = await loadReferenceData(supabase);

    console.log(`[Batch Import] Loaded ${brandMap.size} brands, ${categoryMap.size} categories, ${petTypeMap.size} pet types`);
    console.log(`[Batch Import] Existing products: ${existingSkus.size}`);

    // Phase 2: Transform all products and pre-generate unique slugs
    console.log('[Batch Import] Phase 2: Transforming products and generating slugs...');
    const transformedProducts = shopSiteProducts.map((product) => {
        try {
            const transformed = transformShopSiteProduct(product);
            const isUpdate = existingSkus.has(product.sku);
            
            let slug: string;
            if (isUpdate) {
                slug = slugBySku.get(product.sku) ?? transformed.slug;
            } else {
                slug = generateUniqueSlug(transformed.slug, existingSlugs);
                existingSlugs.add(slug);
            }

            return { 
                product, 
                transformed: { ...transformed, slug }, 
                success: true as const 
            };
        } catch (err) {
            errors.push({
                sku: product.sku,
                error: `Transform failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
            failed++;
            return { product, transformed: null, success: false as const };
        }
    });

    const validProducts = transformedProducts.filter((p): p is SuccessfulTransformedProduct => p.success);
    console.log(`[Batch Import] Transformed ${validProducts.length} products (${failed} failed)`);

    // Phase 3: Batch upsert products
    console.log('[Batch Import] Phase 3: Upserting products in batches...');
    const productBatches = chunk(validProducts, BATCH_SIZE);
    const importedProducts: Array<{ sku: string; id: string; isUpdate: boolean }> = [];

    for (let i = 0; i < productBatches.length; i++) {
        const batch = productBatches[i];
        if (i % 10 === 0) {
            console.log(`[Batch Import] Processing batch ${i + 1}/${productBatches.length}...`);
        }

        try {
            const productsToUpsert = batch.map(({ product, transformed }) => {
                const brandId = transformed.brand_name ? brandMap.get(transformed.brand_name) : null;
                return buildProductRecord(transformed, transformed.slug, brandId ?? null);
            });

            const { data: upserted, error } = await supabase
                .from('products')
                .upsert(productsToUpsert, { onConflict: 'sku' })
                .select('id, sku');

            if (error) {
                console.error(`[Batch Import] Batch ${i + 1} failed:`, error.message);
                failed += batch.length;
                batch.forEach(({ product }) => {
                    errors.push({ sku: product.sku, error: error.message });
                });
            } else if (upserted) {
                for (const product of upserted) {
                    const isUpdate = existingSkus.has(product.sku);
                    importedProducts.push({ sku: product.sku, id: product.id, isUpdate });
                    if (isUpdate) {
                        updated++;
                    } else {
                        created++;
                    }
                }
            }

            if (logProgress) {
                await logProgress(importedProducts.length, shopSiteProducts.length);
            }
        } catch (err) {
            console.error(`[Batch Import] Batch ${i + 1} threw exception:`, err);
            failed += batch.length;
        }
    }

    console.log(`[Batch Import] Products upserted: ${importedProducts.length} (created: ${created}, updated: ${updated})`);

    // Build product ID map
    const importedProductIdBySku = new Map(importedProducts.map((p) => [p.sku, p.id]));

    // Phase 4: Batch insert all relations
    console.log('[Batch Import] Phase 4: Inserting relations in batches...');

    const categoriesToInsert: Array<{ product_id: string; category_id: string }> = [];
    const petTypesToInsert: Array<{ product_id: string; pet_type_id: string }> = [];
    const facetValuesToEnsure: Array<{
        definitionName: GenericFacetName;
        normalizedValue: string;
        originalValue: string;
    }> = [];
    const productFacetsToInsert: Array<{ product_id: string; facet_value_id: string }> = [];

    // Collect all relation data
    for (const { product, transformed } of validProducts) {
        const productId = importedProductIdBySku.get(product.sku);
        if (!productId) continue;

        // Categories (PF24)
        const mappedSlug = getMappedCategorySlug(transformed.category_name, transformed.product_type);
        if (mappedSlug) {
            const categoryId = categoryMap.get(mappedSlug);
            if (categoryId) {
                categoriesToInsert.push({ product_id: productId, category_id: categoryId });
            } else {
                if (categoriesToInsert.length < 5) {
                    console.warn(`[Batch Import] Slug "${mappedSlug}" found but not in categoryMap (size: ${categoryMap.size})`);
                }
            }
        } else {
            if (transformed.category_name && categoriesToInsert.length < 5) {
                // Only log first few failures to avoid spam
                // console.log(`[Batch Import] No mapping for: "${transformed.category_name}" > "${transformed.product_type}"`);
            }
        }

        // Pet types (PF17)
        const resolvedPetTypes = resolveCanonicalPetTypes({
            ...product,
            petTypeName: transformed.pet_type_name ?? product.petTypeName,
        });

        for (const petTypeName of resolvedPetTypes.petTypes) {
            const petTypeId = petTypeMap.get(petTypeName);
            if (petTypeId) {
                petTypesToInsert.push({ product_id: productId, pet_type_id: petTypeId });
            }
        }

        // Generic facets (PF18-23, 26, 27, 29, 30)
        for (const { field, transformedKey } of GENERIC_FACET_INPUTS) {
            const values = transformed[transformedKey];
            if (!values) continue;

            const definition = getGenericFacetDefinition(field);
            const normalizedValues = normalizeGenericFacetValues(values);

            for (const normalizedValue of normalizedValues) {
                facetValuesToEnsure.push({
                    definitionName: definition.name,
                    normalizedValue: normalizedValue.normalizedValue,
                    originalValue: normalizedValue.value,
                });
            }
        }
    }

    // Ensure all facet values exist in bulk
    console.log(`[Batch Import] Ensuring ${facetValuesToEnsure.length} facet values...`);
    const uniqueFacetValues = dedupeFacetValues(facetValuesToEnsure);
    const facetValueIdMap = await ensureFacetValuesBulk(
        supabase,
        uniqueFacetValues,
        facetDefinitionMap,
        facetValueMap,
    );

    // Build product_facets to insert
    for (const { product, transformed } of validProducts) {
        const productId = importedProductIdBySku.get(product.sku);
        if (!productId) continue;

        for (const { field, transformedKey } of GENERIC_FACET_INPUTS) {
            const values = transformed[transformedKey];
            if (!values) continue;

            const definition = getGenericFacetDefinition(field);
            const normalizedValues = normalizeGenericFacetValues(values);

            for (const normalizedValue of normalizedValues) {
                const key = `${definition.name}:${normalizedValue.normalizedValue}`;
                const facetValueId = facetValueIdMap.get(key);
                if (facetValueId) {
                    productFacetsToInsert.push({ product_id: productId, facet_value_id: facetValueId });
                }
            }
        }
    }

    // Delete old relations and insert new ones in batches
    console.log(`[Batch Import] Inserting ${categoriesToInsert.length} category links...`);
    await deleteAndInsertRelations(supabase, 'product_categories', categoriesToInsert);

    console.log(`[Batch Import] Inserting ${petTypesToInsert.length} pet type links...`);
    await deleteAndInsertRelations(supabase, 'product_pet_types', petTypesToInsert);

    console.log(`[Batch Import] Inserting ${productFacetsToInsert.length} facet links...`);
    await deleteAndInsertRelations(supabase, 'product_facets', productFacetsToInsert);

    // Phase 5: Cross-sell linking
    console.log('[Batch Import] Phase 5: Linking cross-sells...');
    const crossSellStats = await linkCrossSellsBatched(
        supabase,
        validProducts,
        importedProductIdBySku,
        productIdBySku,
    );

    // Phase 6: Cleanup (Purge disabled/removed products)
    let deletedCount = 0;
    // Only purge if we successfully processed a significant number of products (full sync safety)
    if (created + updated > 100) {
        console.log('[Batch Import] Phase 6: Purging inactive products...');
        const activeSkusSet = new Set(importedProductIdBySku.keys());
        const skusToDelete = Array.from(existingSkus).filter(sku => !activeSkusSet.has(sku));

        console.log(`[Batch Import] Found ${skusToDelete.length} products to delete.`);

        for (let i = 0; i < skusToDelete.length; i += BATCH_SIZE) {
            const batch = skusToDelete.slice(i, i + BATCH_SIZE);
            const { error: cleanupError, count } = await supabase
                .from('products')
                .delete()
                .in('sku', batch);

            if (!cleanupError) {
                deletedCount += count ?? batch.length;
            } else {
                console.warn(`[Batch Import] Failed to purge batch: ${cleanupError.message}`);
            }
        }
        console.log(`[Batch Import] Purged ${deletedCount} inactive/disabled products.`);
    }
    const duration = Date.now() - startTime;
    console.log(`[Batch Import] Complete! Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`[Batch Import] Results: ${created} created, ${updated} updated, ${failed} failed, ${deletedCount} deleted`);
    console.log(`[Batch Import] Cross-sells: ${crossSellStats.linked} linked, ${crossSellStats.skippedMissing} missing skipped`);

    return {
        success: failed === 0,
        processed: shopSiteProducts.length,
        created,
        updated,
        failed,
        deleted: deletedCount,
        errors,
        crossSellStats,
    } as any;
}

async function fetchAll<T>(
    supabase: SupabaseClient,
    table: string,
    select: string,
): Promise<T[]> {
    const allData: T[] = [];
    const limit = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
            allData.push(...(data as unknown as T[]));
            offset += limit;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

async function loadReferenceData(supabase: SupabaseClient) {
    console.log('[Batch Import] Fetching all reference data (paginated)...');
    const [
        productsData,
        brandsData,
        categoriesData,
        petTypesData,
        facetDefinitionsData,
        facetValuesData,
    ] = await Promise.all([
        fetchAll<{id: string, sku: string, slug: string}>(supabase, 'products', 'id, sku, slug'),
        fetchAll<{id: string, name: string}>(supabase, 'brands', 'id, name'),
        fetchAll<{id: string, name: string, slug: string}>(supabase, 'categories', 'id, name, slug'),
        fetchAll<{id: string, name: string}>(supabase, 'pet_types', 'id, name'),
        fetchAll<{id: string, name: string}>(supabase, 'facet_definitions', 'id, name'),
        fetchAll<{id: string, facet_definition_id: string, normalized_value: string}>(supabase, 'facet_values', 'id, facet_definition_id, normalized_value'),
    ]);

    const existingSkus = new Set<string>();
    const existingSlugs = new Set<string>();
    const slugBySku = new Map<string, string>();
    const productIdBySku = new Map<string, string>();

    for (const product of productsData) {
        existingSkus.add(product.sku);
        existingSlugs.add(product.slug);
        slugBySku.set(product.sku, product.slug);
        productIdBySku.set(product.sku, product.id);
    }

    const brandMap = new Map(brandsData.map((b) => [b.name, b.id]));
    const categoryMap = new Map(categoriesData.map((c) => [c.slug, c.id]));
    const petTypeMap = new Map(petTypesData.map((p) => [p.name, p.id]));
    const facetDefinitionMap = new Map(
        facetDefinitionsData.map((d) => [d.name as GenericFacetName, d.id]),
    );
    const facetValueMap = new Map(
        facetValuesData.map((v) => [`${v.facet_definition_id}:${v.normalized_value}`, v.id]),
    );

    return {
        existingSkus,
        existingSlugs,
        slugBySku,
        productIdBySku,
        brandMap,
        categoryMap,
        petTypeMap,
        facetDefinitionMap,
        facetValueMap,
    };
}

async function processProductBatch(
    supabase: SupabaseClient,
    batch: SuccessfulTransformedProduct[],
    existingSkus: Set<string>,
    existingSlugs: Set<string>,
    slugBySku: Map<string, string>,
    brandMap: Map<string, string>,
) {
    const imported: Array<{ sku: string; id: string; isUpdate: boolean }> = [];
    const errors: Array<{ sku: string; error: string }> = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    const productsToUpsert = batch.map(({ product, transformed }) => {
        const isUpdate = existingSkus.has(product.sku);
        const brandId = transformed.brand_name ? brandMap.get(transformed.brand_name) : null;

        let slug: string;
        if (isUpdate) {
            slug = slugBySku.get(product.sku) ?? transformed.slug;
        } else {
            slug = generateUniqueSlug(transformed.slug, existingSlugs);
            existingSlugs.add(slug);
        }

        return buildProductRecord(transformed, slug, brandId ?? null);
    });

    const { data: upserted, error } = await supabase
        .from('products')
        .upsert(productsToUpsert, { onConflict: 'sku' })
        .select('id, sku');

    if (error) {
        console.error('[Batch Import] Batch upsert failed:', error);
        failed += batch.length;
        batch.forEach(({ product }) => {
            errors.push({ sku: product.sku, error: error.message });
        });
    } else if (upserted) {
        for (const product of upserted) {
            const isUpdate = existingSkus.has(product.sku);
            imported.push({ sku: product.sku, id: product.id, isUpdate });
            if (isUpdate) {
                updated++;
            } else {
                created++;
            }
        }
    }

    return { imported, errors, created, updated, failed };
}

async function ensureFacetValuesBulk(
    supabase: SupabaseClient,
    facetValues: Array<{ definitionName: GenericFacetName; normalizedValue: string; originalValue: string }>,
    facetDefinitionMap: Map<GenericFacetName, string>,
    existingFacetValueMap: Map<string, string>,
): Promise<Map<string, string>> {
    const facetValueIdMap = new Map<string, string>();
    const valuesToCreate: Array<{
        facet_definition_id: string;
        value: string;
        normalized_value: string;
        slug: string;
    }> = [];

    for (const { definitionName, normalizedValue, originalValue } of facetValues) {
        const definitionId = facetDefinitionMap.get(definitionName);
        if (!definitionId) continue;

        const existingKey = `${definitionId}:${normalizedValue}`;
        const existingId = existingFacetValueMap.get(existingKey);

        if (existingId) {
            facetValueIdMap.set(`${definitionName}:${normalizedValue}`, existingId);
        } else {
            valuesToCreate.push({
                facet_definition_id: definitionId,
                value: originalValue,
                normalized_value: normalizedValue,
                slug: normalizedValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            });
        }
    }

    if (valuesToCreate.length > 0) {
        const { data: created, error } = await supabase
            .from('facet_values')
            .upsert(valuesToCreate, { onConflict: 'facet_definition_id, normalized_value' })
            .select('id, facet_definition_id, normalized_value');

        if (error) {
            console.error('[Batch Import] Failed to create facet values:', error);
        } else if (created) {
            for (const value of created) {
                const definitionName = Array.from(facetDefinitionMap.entries()).find(
                    ([, id]) => id === value.facet_definition_id,
                )?.[0];
                if (definitionName) {
                    facetValueIdMap.set(`${definitionName}:${value.normalized_value}`, value.id);
                    existingFacetValueMap.set(`${value.facet_definition_id}:${value.normalized_value}`, value.id);
                }
            }
        }
    }

    return facetValueIdMap;
}

async function deleteAndInsertRelations<T extends { product_id: string }>(
    supabase: SupabaseClient,
    table: string,
    relations: T[],
) {
    if (relations.length === 0) return;

    // Get unique product IDs
    const productIds = [...new Set(relations.map((r) => r.product_id))];

    // Delete existing relations for these products
    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        const batch = productIds.slice(i, i + BATCH_SIZE);
        await supabase.from(table).delete().in('product_id', batch);
    }

    // Insert new relations in batches
    for (let i = 0; i < relations.length; i += BATCH_SIZE) {
        const batch = relations.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from(table).upsert(batch, {
            onConflict: table === 'product_categories'
                ? 'product_id, category_id'
                : table === 'product_pet_types'
                    ? 'product_id, pet_type_id'
                    : 'product_id, facet_value_id',
        });

        if (error) {
            console.error(`[Batch Import] Failed to insert ${table}:`, error);
        }
    }
}

async function linkCrossSellsBatched(
    supabase: SupabaseClient,
    products: Array<{ product: ShopSiteProduct }>,
    importedProductIdBySku: Map<string, string>,
    allProductIdBySku: Map<string, string>,
) {
    const crossSellsToInsert: Array<{
        product_id: string;
        related_product_id: string;
        relation_type: 'cross_sell';
        position: number;
    }> = [];

    let linked = 0;
    let skippedDuplicates = 0;
    let skippedSelfLinks = 0;
    let skippedMissing = 0;

    for (const { product } of products) {
        const sourceProductId = importedProductIdBySku.get(product.sku);
        if (!sourceProductId) continue;

        const targetSkus = normalizeCrossSellSkus(product.crossSellSkus);
        if (targetSkus.length === 0) continue;

        const seenSkus = new Set<string>();

        for (const targetSku of targetSkus) {
            // Skip duplicates within same product
            if (seenSkus.has(targetSku)) {
                skippedDuplicates++;
                continue;
            }
            seenSkus.add(targetSku);

            // Skip self-links
            if (targetSku === product.sku) {
                skippedSelfLinks++;
                continue;
            }

            // Lookup target product
            const targetProductId = allProductIdBySku.get(targetSku) || importedProductIdBySku.get(targetSku);
            if (!targetProductId) {
                skippedMissing++;
                continue;
            }

            crossSellsToInsert.push({
                product_id: sourceProductId,
                related_product_id: targetProductId,
                relation_type: 'cross_sell',
                position: crossSellsToInsert.length,
            });
            linked++;
        }
    }

    // Delete existing cross-sells for imported products
    const importedProductIds = [...importedProductIdBySku.values()];
    for (let i = 0; i < importedProductIds.length; i += BATCH_SIZE) {
        const batch = importedProductIds.slice(i, i + BATCH_SIZE);
        await supabase
            .from('related_products')
            .delete()
            .in('product_id', batch)
            .eq('relation_type', 'cross_sell');
    }

    // Insert new cross-sells in batches
    for (let i = 0; i < crossSellsToInsert.length; i += BATCH_SIZE) {
        const batch = crossSellsToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('related_products')
            .upsert(batch, { onConflict: 'product_id, related_product_id, relation_type' });

        if (error) {
            console.error('[Batch Import] Failed to insert cross-sells:', error);
        }
    }

    return { linked, skippedDuplicates, skippedSelfLinks, skippedMissing };
}

function buildProductRecord(
    transformed: TransformedShopSiteProduct,
    slug: string,
    brandId: string | null,
): Record<string, unknown> {
    const {
        brand_name: _brandName,
        category_name: _categoryName,
        product_type: _productType,
        pet_type_name: _petTypeName,
        life_stage: _lifeStage,
        pet_size: _petSize,
        special_diet: _specialDiet,
        health_feature: _healthFeature,
        food_form: _foodForm,
        flavor: _flavor,
        product_feature: _productFeature,
        size: _size,
        color: _color,
        packaging_type: _packagingType,
        ...productFields
    } = transformed;

    return {
        ...productFields,
        slug,
        brand_id: brandId,
    };
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

// Helpers
function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

function dedupeFacetValues(
    values: Array<{ definitionName: GenericFacetName; normalizedValue: string; originalValue: string }>,
): Array<{ definitionName: GenericFacetName; normalizedValue: string; originalValue: string }> {
    const seen = new Set<string>();
    return values.filter((v) => {
        const key = `${v.definitionName}:${v.normalizedValue}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const GENERIC_FACET_INPUTS: ReadonlyArray<{ field: GenericFacetField; transformedKey: GenericFacetInputKey }> = [
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
            .from("products_ingestion")
            .select("sku, input, pipeline_status")
            .in("sku", batchSkus);

        if (existingRowsError) {
            throw new Error(`Failed to load products_ingestion rows: ${existingRowsError.message}`);
        }

        if (!existingRows || existingRows.length === 0) {
            continue;
        }

        const updatedAt = new Date().toISOString();
        const updateRows = existingRows.map((row) => {
            const existingInput =
                row.input && typeof row.input === "object" && !Array.isArray(row.input)
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
            .from("products_ingestion")
            .upsert(updateRows, { onConflict: "sku" });

        if (upsertError) {
            throw new Error(`Failed to sync products_ingestion inputs: ${upsertError.message}`);
        }

        updated += updateRows.length;
    }

    return { updated };
}
