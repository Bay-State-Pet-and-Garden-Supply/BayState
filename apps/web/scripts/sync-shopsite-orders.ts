import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import { transformShopSiteOrder } from '../lib/admin/migration/order-sync';
import type { SyncResult, ShopSiteOrder } from '../lib/admin/migration/types';

const MIGRATION_SETTINGS_KEY = 'shopsite_migration';

function getArgValue(name: string): string | undefined {
    const exact = process.argv.find((arg) => arg === `--${name}`);
    if (exact) {
        const next = process.argv[process.argv.indexOf(exact) + 1];
        return next && !next.startsWith('--') ? next : 'true';
    }

    const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return prefixed?.split('=').slice(1).join('=');
}

async function startLog(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
        .from('migration_log')
        .insert({
            sync_type: 'orders' as any, // Using any as the enum might not include 'orders' yet
            status: 'running',
        } as any)
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create migration log:', error.message);
        return null;
    }

    return data?.id ?? null;
}

async function completeLog(supabase: SupabaseClient, logId: string, result: SyncResult): Promise<void> {
    const { error } = await supabase
        .from('migration_log')
        .update({
            completed_at: new Date().toISOString(),
            status: result.success ? 'completed' : 'failed',
            processed: result.processed,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
            duration_ms: result.duration,
            errors: result.errors as any,
        } as any)
        .eq('id', logId);

    if (error) {
        console.error('Failed to complete migration log:', error.message);
    }
}

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    }

    const limitArg = getArgValue('limit');
    const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
    
    const startDate = getArgValue('start-date');

    const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    // 1. Fetch Credentials
    const { data: settings, error: settingsError } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MIGRATION_SETTINGS_KEY)
        .single();

    if (settingsError || !settings) {
        throw new Error(`Failed to load ShopSite credentials: ${settingsError?.message ?? 'missing row'}`);
    }

    const credentials = settings.value as {
        storeUrl: string;
        merchantId: string;
        password: string;
    };

    console.log('Starting ShopSite order sync...');
    const logId = await startLog(supabase);
    const startedAt = Date.now();

    try {
        const client = new ShopSiteClient(credentials);
        
        // 2. Fetch Orders from ShopSite
        console.log(`Fetching orders from ShopSite${startDate ? ` since ${startDate}` : ''}...`);
        const shopsiteOrders = await client.fetchOrders({ 
            limit, 
            version: '15.0',
            startDate 
        });
        console.log(`Downloaded ${shopsiteOrders.length} orders`);

        // 3. Prepare Mapping Tables
        console.log('Fetching profile and product mappings...');
        const { data: profiles } = await supabase.from('profiles').select('id, email');
        const { data: products } = await supabase.from('products').select('id, sku');

        const profileIdMap = new Map<string, string>();
        profiles?.forEach(p => {
            if (p.email) profileIdMap.set(p.email.toLowerCase(), p.id);
        });

        const productIdMap = new Map<string, string>();
        products?.forEach(p => {
            if (p.sku) productIdMap.set(p.sku, p.id);
        });

        // 4. Transform and Upsert Orders
        let created = 0;
        let updated = 0;
        let failed = 0;
        const errors: any[] = [];

        for (const order of shopsiteOrders) {
            try {
                const { order: transformed, items } = transformShopSiteOrder(order, profileIdMap, productIdMap);
                
                // Upsert Order
                const { data: upsertedOrder, error: orderError } = await supabase
                    .from('orders')
                    .upsert({
                        order_number: transformed.legacy_order_number,
                        customer_name: transformed.customer_name,
                        customer_email: transformed.customer_email,
                        status: transformed.status,
                        subtotal: transformed.subtotal,
                        tax: transformed.tax,
                        total: transformed.total,
                        created_at: transformed.created_at,
                        payment_method: transformed.payment_details.method === 'CreditCard' ? 'credit_card' : 'paypal',
                        notes: `Imported from ShopSite. Transaction ID: ${transformed.shopsite_transaction_id || 'N/A'}`
                    }, { onConflict: 'order_number' })
                    .select('id')
                    .single();

                if (orderError) throw orderError;
                
                // Upsert Items
                if (upsertedOrder && items.length > 0) {
                    const mappedItems = items.map(item => ({
                        order_id: upsertedOrder.id,
                        item_type: 'product',
                        item_id: item.item_id || '00000000-0000-0000-0000-000000000000', // Fallback for missing products
                        item_name: `Product ${item.legacy_sku}`,
                        item_slug: item.legacy_sku,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.unit_price * item.quantity
                    }));

                    const { error: itemsError } = await supabase
                        .from('order_items')
                        .upsert(mappedItems, { onConflict: 'order_id,item_slug' } as any);
                    
                    if (itemsError) {
                        console.warn(`Warning: Failed to upsert items for order ${transformed.legacy_order_number}:`, itemsError.message);
                    }
                }

                created++; // Treating upsert as 'created' for simplicity in log
            } catch (err: any) {
                console.error(`Failed to process order ${order.orderNumber}:`, err.message);
                failed++;
                errors.push({
                    record: order.orderNumber,
                    error: err.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        const finalResult: SyncResult = {
            success: failed === 0,
            processed: shopsiteOrders.length,
            created,
            updated,
            failed,
            errors,
            duration: Date.now() - startedAt
        };

        if (logId) {
            await completeLog(supabase, logId, finalResult);
        }

        console.log('Order sync complete');
        console.log(JSON.stringify(finalResult, null, 2));

    } catch (error: any) {
        console.error('Fatal sync error:', error.message);
        if (logId) {
            await completeLog(supabase, logId, {
                success: false,
                processed: 0,
                created: 0,
                updated: 0,
                failed: 1,
                errors: [{ record: 'FATAL', error: error.message, timestamp: new Date().toISOString() }],
                duration: Date.now() - startedAt
            });
        }
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unhandled error in sync script:', error);
    process.exit(1);
});
