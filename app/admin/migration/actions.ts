'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ShopSiteClient, ShopSiteConfig } from '@/lib/admin/migration/shopsite-client';
import { transformShopSiteProduct, generateUniqueSlug } from '@/lib/admin/migration/product-sync';
import { transformShopSiteCustomer } from '@/lib/admin/migration/customer-sync';
import { transformShopSiteOrder, batchOrders } from '@/lib/admin/migration/order-sync';
import { inferPetTypes, PetTypeName } from '@/lib/admin/migration/pet-type-inference';
import { SyncResult, MigrationError, ShopSiteProduct, ShopSiteCustomer, ShopSiteOrder } from '@/lib/admin/migration/types';
import { startMigrationLog, completeMigrationLog, updateMigrationProgress } from '@/lib/admin/migration/history';

const MIGRATION_SETTINGS_KEY = 'shopsite_migration';

interface MigrationCredentials {
    storeUrl: string;
    merchantId: string;
    password: string;
}

/**
 * Get saved ShopSite credentials from site_settings.
 */
export async function getCredentials(): Promise<MigrationCredentials | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MIGRATION_SETTINGS_KEY)
        .single();

    if (error || !data) {
        return null;
    }

    return data.value as MigrationCredentials;
}

/**
 * Save ShopSite credentials to site_settings.
 */
export async function saveCredentialsAction(formData: FormData): Promise<void> {
    const supabase = await createClient();

    const credentials: MigrationCredentials = {
        storeUrl: formData.get('storeUrl') as string,
        merchantId: formData.get('merchantId') as string,
        password: formData.get('password') as string,
    };

    // Validate inputs
    if (!credentials.storeUrl || !credentials.merchantId || !credentials.password) {
        throw new Error('All fields are required');
    }

    // Upsert the credentials
    const { error } = await supabase
        .from('site_settings')
        .upsert({
            key: MIGRATION_SETTINGS_KEY,
            value: credentials,
        }, {
            onConflict: 'key',
        });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/admin/migration');
}

/**
 * Test the ShopSite connection with saved credentials.
 */
export async function testConnectionAction() {
    const credentials = await getCredentials();

    if (!credentials) {
        return { success: false, error: 'No credentials configured' };
    }

    const config: ShopSiteConfig = {
        storeUrl: credentials.storeUrl,
        merchantId: credentials.merchantId,
        password: credentials.password,
    };

    const client = new ShopSiteClient(config);
    const result = await client.testConnection();

    return result;
}

/**
 * Sync products from ShopSite to Supabase.
 * Uses upsert with SKU as the unique identifier for idempotency.
 */
export async function syncProductsAction(): Promise<SyncResult> {
    const startTime = Date.now();

    const logId = await startMigrationLog('products');

    const credentials = await getCredentials();
    if (!credentials) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: 'No credentials configured', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    // Fetch products from ShopSite
    const config: ShopSiteConfig = {
        storeUrl: credentials.storeUrl,
        merchantId: credentials.merchantId,
        password: credentials.password,
    };

    const client = new ShopSiteClient(config);
    let shopSiteProducts = [];
    try {
        shopSiteProducts = await client.fetchProducts();
    } catch (err) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: err instanceof Error ? err.message : 'Failed to fetch products', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    const result = await processProducts(shopSiteProducts, logId ?? undefined);
    return result;
}

/**
 * Shared logic for processing ShopSite products.
 */
async function processProducts(shopSiteProducts: ShopSiteProduct[], logId?: string): Promise<SyncResult> {
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

    const supabase = await createClient();

    // Get existing slugs to ensure uniqueness
    const { data: existingProducts } = await supabase
        .from('products')
        .select('slug, sku');

    const existingSlugs = new Set((existingProducts || []).map((p: { slug: string }) => p.slug));
    const existingSkus = new Set((existingProducts || []).map((p: { sku: string }) => p.sku).filter(Boolean));

    // ------------------------------------------------------------------------
    // Step 1: Pre-process Brands and Categories
    // ------------------------------------------------------------------------
    const brandNames = new Set<string>();
    const categoryNames = new Set<string>();

    for (const p of shopSiteProducts) {
        if (p.brandName?.trim()) brandNames.add(p.brandName.trim());
        if (p.categoryName?.trim()) {
            // Split pipe-delimited categories if any
            p.categoryName.split('|').forEach((c: string) => categoryNames.add(c.trim()));
        }
    }

    const brandMap = new Map<string, string>();     // name -> uuid
    const categoryMap = new Map<string, string>();  // name -> uuid
    const petTypeMap = new Map<PetTypeName, string>(); // pet type name -> uuid

    // Upsert Brands
    if (brandNames.size > 0) {
        for (const name of Array.from(brandNames)) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // First try to select
            const { data: existing } = await supabase.from('brands').select('id').eq('slug', slug).single();

            if (existing) {
                brandMap.set(name, existing.id);
            } else {
                const { data: created } = await supabase.from('brands').insert({
                    name,
                    slug
                }).select('id').single();
                if (created) brandMap.set(name, created.id);
            }
        }
    }

    // Upsert Categories
    if (categoryNames.size > 0) {
        for (const name of Array.from(categoryNames)) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // First try to select
            const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).single();

            if (existing) {
                categoryMap.set(name, existing.id);
            } else {
                const { data: created } = await supabase.from('categories').insert({
                    name,
                    slug,
                    display_order: 0
                }).select('id').single();
                if (created) categoryMap.set(name, created.id);
            }
        }
    }

    // Fetch Pet Types for inference mapping
    const { data: petTypes } = await supabase.from('pet_types').select('id, name');
    for (const pt of petTypes || []) {
        petTypeMap.set(pt.name as PetTypeName, pt.id);
    }

    // ------------------------------------------------------------------------
    // Step 2: Transform and Upsert Products
    // ------------------------------------------------------------------------

    // Store category links to insert after products
    const productCategoryLinks: { product_id: string, category_id: string }[] = [];

    // Store pet type links and attributes to insert after products
    const productPetTypeLinks: { product_id: string, pet_type_id: string, confidence: string }[] = [];
    const productPetAttributes: {
        product_id: string,
        life_stages: string[],
        size_classes: string[],
        special_needs: string[],
        min_weight_lbs: number | null,
        max_weight_lbs: number | null,
        confidence: string
    }[] = [];

    // Transform and upsert each product
    for (const shopSiteProduct of shopSiteProducts) {
        try {
            const { brand_name, ...transformed } = transformShopSiteProduct(shopSiteProduct);

            // Build the database record with brand_id lookup
            const productRecord: Record<string, unknown> = { ...transformed };

            // Lookup Brand
            if (brand_name) {
                const brandId = brandMap.get(brand_name.trim());
                if (brandId) {
                    productRecord.brand_id = brandId;
                }
            }

            // Check if product exists by SKU
            const isUpdate = existingSkus.has(shopSiteProduct.sku);

            // Generate unique slug for new products
            if (!isUpdate) {
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
                if (upserted && shopSiteProduct.categoryName) {
                    const cats = shopSiteProduct.categoryName.split('|');
                    for (const c of cats) {
                        const catId = categoryMap.get(c.trim());
                        if (catId) {
                            productCategoryLinks.push({
                                product_id: upserted.id,
                                category_id: catId
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
                                confidence: 'inferred'
                            });
                        }
                    }

                    if (inference.petTypes.length > 0) {
                        productPetAttributes.push({
                            product_id: upserted.id,
                            life_stages: inference.lifeStages,
                            size_classes: inference.sizeClasses,
                            special_needs: inference.specialNeeds,
                            min_weight_lbs: inference.minWeightLbs,
                            max_weight_lbs: inference.maxWeightLbs,
                            confidence: 'inferred'
                        });
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

        // Update progress every 10 records
        if ((created + updated + failed) % 10 === 0 && logId) {
            await updateMigrationProgress(logId, {
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

    // ------------------------------------------------------------------------
    // Step 3: Insert Product-Category Links
    // ------------------------------------------------------------------------
    if (productCategoryLinks.length > 0) {
        // Process in batches of 1000 to avoid request size limits
        const BATCH_SIZE = 1000;
        for (let i = 0; i < productCategoryLinks.length; i += BATCH_SIZE) {
            const batch = productCategoryLinks.slice(i, i + BATCH_SIZE);
            const { error: linkError } = await supabase
                .from('product_categories')
                .upsert(batch, { onConflict: 'product_id, category_id' });

            if (linkError) {
                console.error('Error inserting product categories:', linkError);
                // We don't fail the whole sync for this, but log it
                addError('CATEGORY_LINKS', `Failed to link ${batch.length} categories: ${linkError.message}`);
            }
        }
    }

    // ------------------------------------------------------------------------
    // Step 4: Insert Product-PetType Links
    // ------------------------------------------------------------------------
    if (productPetTypeLinks.length > 0) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < productPetTypeLinks.length; i += BATCH_SIZE) {
            const batch = productPetTypeLinks.slice(i, i + BATCH_SIZE);
            const { error: linkError } = await supabase
                .from('product_pet_types')
                .upsert(batch, { onConflict: 'product_id, pet_type_id' });

            if (linkError) {
                console.error('Error inserting product pet types:', linkError);
                addError('PET_TYPE_LINKS', `Failed to link ${batch.length} pet types: ${linkError.message}`);
            }
        }
    }

    // ------------------------------------------------------------------------
    // Step 5: Insert Product Pet Attributes
    // ------------------------------------------------------------------------
    if (productPetAttributes.length > 0) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < productPetAttributes.length; i += BATCH_SIZE) {
            const batch = productPetAttributes.slice(i, i + BATCH_SIZE);
            const { error: attrError } = await supabase
                .from('product_pet_attributes')
                .upsert(batch, { onConflict: 'product_id' });

            if (attrError) {
                console.error('Error inserting product pet attributes:', attrError);
                addError('PET_ATTRIBUTES', `Failed to insert ${batch.length} pet attributes: ${attrError.message}`);
            }
        }
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/migration');

    const result = {
        success: failed === 0,
        processed: shopSiteProducts.length,
        created,
        updated,
        failed,
        errors,
        duration: Date.now() - startTime,
    };

    if (logId) await completeMigrationLog(logId, result);

    return result;
}

/**
 * Form action wrapper for syncProducts.
 */
export async function syncProductsFormAction(): Promise<void> {
    await syncProductsAction();
}

/**
 * Sync customers from ShopSite to Supabase profiles.
 */
export async function syncCustomersAction(): Promise<SyncResult> {
    const startTime = Date.now();
    const logId = await startMigrationLog('customers');

    const credentials = await getCredentials();
    if (!credentials) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: 'No credentials configured', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    const config: ShopSiteConfig = {
        storeUrl: credentials.storeUrl,
        merchantId: credentials.merchantId,
        password: credentials.password,
    };

    const client = new ShopSiteClient(config);
    let shopSiteCustomers = [];
    try {
        shopSiteCustomers = await client.fetchCustomers();
    } catch (err) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: err instanceof Error ? err.message : 'Failed to fetch customers', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    const result = await processCustomers(shopSiteCustomers, logId ?? undefined);
    return result;
}

/**
 * Shared logic for processing ShopSite customers.
 */
async function processCustomers(shopSiteCustomers: ShopSiteCustomer[], logId?: string): Promise<SyncResult> {
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

    if (shopSiteCustomers.length === 0) {
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

    const supabase = await createClient();

    // Get existing emails to check for updates
    const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('email');

    const existingEmails = new Set((existingProfiles || []).map((p: { email?: string }) => p.email?.toLowerCase()));

    for (const shopSiteCustomer of shopSiteCustomers) {
        try {
            const transformed = transformShopSiteCustomer(shopSiteCustomer);
            const isUpdate = existingEmails.has(transformed.email);

            const { error } = await supabase
                .from('profiles')
                .upsert(transformed, {
                    onConflict: 'email',
                });

            if (error) {
                addError(shopSiteCustomer.email, error.message);
                failed++;
            } else {
                if (isUpdate) {
                    updated++;
                } else {
                    created++;
                    existingEmails.add(transformed.email);
                }
            }
        } catch (err) {
            addError(shopSiteCustomer.email, err instanceof Error ? err.message : 'Unknown error');
            failed++;
        }

        if ((created + updated + failed) % 10 === 0 && logId) {
            await updateMigrationProgress(logId, {
                success: true,
                processed: shopSiteCustomers.length,
                created,
                updated,
                failed,
                errors: [],
                duration: Date.now() - startTime,
            });
        }
    }

    revalidatePath('/admin/migration');

    const result = {
        success: failed === 0,
        processed: shopSiteCustomers.length,
        created,
        updated,
        failed,
        errors,
        duration: Date.now() - startTime,
    };

    if (logId) await completeMigrationLog(logId, result);

    return result;
}

/**
 * Form action wrapper for syncCustomers.
 */
export async function syncCustomersFormAction(): Promise<void> {
    await syncCustomersAction();
}

/**
 * Sync orders from ShopSite to Supabase.
 */
export async function syncOrdersAction(): Promise<SyncResult> {
    const startTime = Date.now();
    const logId = await startMigrationLog('orders');

    const credentials = await getCredentials();
    if (!credentials) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: 'No credentials configured', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    const config: ShopSiteConfig = {
        storeUrl: credentials.storeUrl,
        merchantId: credentials.merchantId,
        password: credentials.password,
    };

    const client = new ShopSiteClient(config);
    let shopSiteOrders = [];
    try {
        shopSiteOrders = await client.fetchOrders();
    } catch (err) {
        const result = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [{ record: 'N/A', error: err instanceof Error ? err.message : 'Failed to fetch orders', timestamp: new Date().toISOString() }],
            duration: Date.now() - startTime,
        };
        if (logId) await completeMigrationLog(logId, result);
        return result;
    }

    const result = await processOrders(shopSiteOrders, logId ?? undefined);
    return result;
}

/**
 * Shared logic for processing ShopSite orders.
 */
async function processOrders(shopSiteOrders: ShopSiteOrder[], logId?: string): Promise<SyncResult> {
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

    if (shopSiteOrders.length === 0) {
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

    console.log(`[Sync] processOrders starting for ${shopSiteOrders.length} orders...`);
    const supabase = await createClient();

    // Build lookup maps for profiles and products
    console.log('[Sync] Fetching profiles...');
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, email');
    if (profilesError) console.error('[Sync] Error fetching profiles:', profilesError);

    console.log('[Sync] Fetching products...');
    const { data: products, error: productsError } = await supabase.from('products').select('id, sku');
    if (productsError) console.error('[Sync] Error fetching products:', productsError);

    const profileIdMap = new Map<string, string>();
    (profiles || []).forEach((p: { id: string; email?: string }) => {
        if (p.email) profileIdMap.set(p.email.toLowerCase(), p.id);
    });

    const productIdMap = new Map<string, string>();
    (products || []).forEach((p: { id: string; sku?: string }) => {
        if (p.sku) productIdMap.set(p.sku, p.id);
    });

    console.log('[Sync] Fetching existing orders...');
    const { data: existingOrders, error: existingOrdersError } = await supabase
        .from('orders')
        .select('legacy_order_number');

    if (existingOrdersError) console.error('[Sync] Error fetching existing orders:', existingOrdersError);

    const existingOrderNumbers = new Set(
        (existingOrders || [])
            .map((o: { legacy_order_number?: string }) => o.legacy_order_number)
            .filter(Boolean)
    );

    const BATCH_SIZE = 50;
    const orderBatches = batchOrders(shopSiteOrders, BATCH_SIZE);
    console.log(`[Sync] Starting processing of ${orderBatches.length} batches (size ${BATCH_SIZE})...`);

    let batchCount = 0;
    for (const batch of orderBatches) {
        batchCount++;
        if (batchCount % 5 === 0) console.log(`[Sync] Processing batch ${batchCount}/${orderBatches.length}`);

        try {
            const batchOrdersData = [];
            const batchOrdersItems: ReturnType<typeof transformShopSiteOrder>['items'][] = [];
            const batchLegacyNumbers: string[] = [];

            for (const shopSiteOrder of batch) {
                const { order: orderData, items } = transformShopSiteOrder(
                    shopSiteOrder,
                    profileIdMap,
                    productIdMap
                );
                batchOrdersData.push(orderData);
                batchOrdersItems.push(items);
                batchLegacyNumbers.push(shopSiteOrder.orderNumber);
            }

            // 1. Batch Upsert Orders
            const { data: upsertedOrders, error: orderError } = await supabase
                .from('orders')
                .upsert(batchOrdersData, { onConflict: 'legacy_order_number' })
                .select('id, legacy_order_number');

            if (orderError) {
                console.error(`[Sync] Failed to upsert order batch:`, orderError);
                for (const order of batch) addError(order.orderNumber, orderError.message);
                failed += batch.length;
                continue;
            }

            if (upsertedOrders) {
                const idMap = new Map<string, string>();
                upsertedOrders.forEach((o: { id: string, legacy_order_number: string }) => {
                    idMap.set(o.legacy_order_number, o.id);
                });

                // Update stats and prepare items
                const allItemsToInsert: (ReturnType<typeof transformShopSiteOrder>['items'][0] & { order_id: string })[] = [];
                const orderIdsToClear: string[] = [];

                batch.forEach((shopSiteOrder, index) => {
                    if (existingOrderNumbers.has(shopSiteOrder.orderNumber)) {
                        updated++;
                    } else {
                        created++;
                        existingOrderNumbers.add(shopSiteOrder.orderNumber);
                    }

                    const dbOrderId = idMap.get(shopSiteOrder.orderNumber);
                    if (dbOrderId) {
                        orderIdsToClear.push(dbOrderId);
                        const items = batchOrdersItems[index];
                        items.forEach((item) => {
                            allItemsToInsert.push({
                                ...item,
                                order_id: dbOrderId,
                            });
                        });
                    }
                });

                // 2. Clear existing items for these orders
                if (orderIdsToClear.length > 0) {
                    await supabase
                        .from('order_items')
                        .delete()
                        .in('order_id', orderIdsToClear);
                }

                // 3. Insert fresh items
                if (allItemsToInsert.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('order_items')
                        .insert(allItemsToInsert);

                    if (itemsError) {
                        console.error(`[Sync] Failed to insert items for batch:`, itemsError);
                        addError(`Batch items`, itemsError.message);
                    }
                }
            }

        } catch (err) {
            console.error(`[Sync] Exception in batch processing:`, err);
            addError('BATCH', err instanceof Error ? err.message : 'Unknown error');
            failed += batch.length;
        }

        if (logId) {
            await updateMigrationProgress(logId, {
                success: true,
                processed: shopSiteOrders.length,
                created,
                updated,
                failed,
                errors: [],
                duration: Date.now() - startTime,
            });
        }
    }

    revalidatePath('/admin/orders');
    revalidatePath('/admin/migration');

    const result = {
        success: failed === 0,
        processed: shopSiteOrders.length,
        created,
        updated,
        failed,
        errors,
        duration: Date.now() - startTime,
    };

    if (logId) await completeMigrationLog(logId, result);

    return result;
}

/**
 * Handle manual XML file upload for migration.
 */
export async function syncUploadedXmlAction(formData: FormData): Promise<SyncResult> {
    const file = formData.get('xmlFile') as File;
    const type = formData.get('syncType') as 'products' | 'orders' | 'customers';

    if (!file || !type) {
        throw new Error('File and sync type are required');
    }

    const xmlText = await file.text();
    const logId = await startMigrationLog(type);

    // We reuse the parsing logic from ShopSiteClient
    // but without needing a configuration since we have the XML directly
    const client = new ShopSiteClient({ storeUrl: 'http://local', merchantId: 'local', password: 'local' });

    let result: SyncResult;

    switch (type) {
        case 'products':
            const products = (client as unknown as { parseProductsXml(xml: string): ShopSiteProduct[] }).parseProductsXml(xmlText);
            result = await processProducts(products, logId ?? undefined);
            break;
        case 'orders':
            const orders = (client as unknown as { parseOrdersXml(xml: string): ShopSiteOrder[] }).parseOrdersXml(xmlText);
            result = await processOrders(orders, logId ?? undefined);
            break;
        case 'customers':
            const customers = (client as unknown as { parseCustomersXml(xml: string): ShopSiteCustomer[] }).parseCustomersXml(xmlText);
            result = await processCustomers(customers, logId ?? undefined);
            break;
        default:
            throw new Error('Invalid sync type');
    }

    return result;
}

/**
 * Form action wrapper for syncOrders.
 */
export async function syncOrdersFormAction(): Promise<void> {
    await syncOrdersAction();
}
