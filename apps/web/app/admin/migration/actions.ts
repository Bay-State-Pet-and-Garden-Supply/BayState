'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ShopSiteClient, ShopSiteConfig } from '@/lib/admin/migration/shopsite-client';
import { transformShopSiteCustomer } from '@/lib/admin/migration/customer-sync';
import { SyncResult, MigrationError, ShopSiteProduct, ShopSiteCustomer } from '@/lib/admin/migration/types';
import { startMigrationLog, completeMigrationLog, updateMigrationProgress } from '@/lib/admin/migration/history';
import { importShopSiteProducts } from '@/lib/admin/migration/product-import';

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
        shopSiteProducts = await client.fetchProducts(undefined, { includeRawXml: false });
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
    const supabase = await createClient();
    const result = await importShopSiteProducts({
        supabase,
        shopSiteProducts,
        logId,
        updateProgress: logId
            ? async (progressResult) => updateMigrationProgress(logId, progressResult)
            : undefined,
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/migration');

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
 * Orders sync is deprecated and no longer available in admin migration UI.
 */
export async function syncOrdersAction(): Promise<SyncResult> { throw new Error('Orders migration is deprecated'); }

export async function syncOrdersFormAction(): Promise<void> { throw new Error('Orders migration is deprecated'); }

/**
 * Handle manual XML file upload for migration.
 */
export async function syncUploadedXmlAction(formData: FormData): Promise<SyncResult> {
    const file = formData.get('xmlFile') as File;
    const type = formData.get('syncType') as 'products' | 'customers';

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
        case 'customers':
            const customers = (client as unknown as { parseCustomersXml(xml: string): ShopSiteCustomer[] }).parseCustomersXml(xmlText);
            result = await processCustomers(customers, logId ?? undefined);
            break;
        default:
            throw new Error('Invalid sync type');
    }

    return result;
}

