import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ShopSiteClient } from '../lib/admin/migration/shopsite-client';
import { transformShopSiteOrder } from '../lib/admin/migration/order-sync';
import { chunk, parseNumericOrderNumber } from '../lib/admin/migration/shopsite-order-sync-utils';
import type { SyncResult, ShopSiteOrder } from '../lib/admin/migration/types';

const MIGRATION_SETTINGS_KEY = 'shopsite_migration';
const ORDER_BATCH_SIZE = 200;
const UUID_NIL = '00000000-0000-0000-0000-000000000000';

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

async function startIntegrationSyncRun(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
        .from('integration_sync_runs')
        .insert({
            source_type: 'shopsite',
            source_system: 'shopsite_15',
            sync_kind: 'orders',
            status: 'running',
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create integration sync run:', error.message);
        return null;
    }

    return data?.id ?? null;
}

async function completeIntegrationSyncRun(supabase: SupabaseClient, syncRunId: string, result: SyncResult): Promise<void> {
    const { error } = await supabase
        .from('integration_sync_runs')
        .update({
            completed_at: new Date().toISOString(),
            status: result.success ? 'completed' : (result.failed > 0 && result.created > 0 ? 'partial' : 'failed'),
            row_count: result.processed,
            inserted_count: result.created,
            updated_count: result.updated,
            skipped_count: 0,
            error_count: result.failed,
            error_summary: result.errors.length > 0 ? JSON.stringify(result.errors.slice(0, 10)) : null,
        })
        .eq('id', syncRunId);

    if (error) {
        console.error('Failed to complete integration sync run:', error.message);
    }
}

async function getShopSiteHighWaterOrder(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
        .from('orders')
        .select('order_number')
        .eq('source', 'shopsite');

    if (error) {
        throw new Error(`Failed to load ShopSite high-water mark: ${error.message}`);
    }

    let maxOrderNumber: number | null = null;
    for (const row of data ?? []) {
        const parsed = parseNumericOrderNumber(row.order_number);
        if (parsed === null) {
            continue;
        }
        if (maxOrderNumber === null || parsed > maxOrderNumber) {
            maxOrderNumber = parsed;
        }
    }

    if (maxOrderNumber === null) {
        return null;
    }

    return String(maxOrderNumber + 1);
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
    const syncRunId = await startIntegrationSyncRun(supabase);
    const startedAt = Date.now();

    try {
        const client = new ShopSiteClient(credentials);
        
        // 1. Determine High-Water Mark (Latest ShopSite Order Number)
        let startOrderArg = getArgValue('start-order');
        if (!startOrderArg && !startDate) {
            console.log('No start-order or start-date provided. Checking database for latest ShopSite order...');
            startOrderArg = await getShopSiteHighWaterOrder(supabase) ?? undefined;
            if (startOrderArg) {
                console.log(`Resuming from ShopSite order number: ${startOrderArg}`);
            }
        }

        // 2. Fetch Orders from ShopSite
        console.log(`Fetching orders from ShopSite${startOrderArg ? ` starting at #${startOrderArg}` : startDate ? ` since ${startDate}` : ''}...`);
        const shopsiteOrders = await client.fetchOrders({ 
            limit, 
            version: '15.0',
            startDate,
            startOrder: startOrderArg
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
        const updated = 0;
        let failed = 0;
        const errors: any[] = [];

        const orderBatches = chunk(shopsiteOrders, ORDER_BATCH_SIZE);
        for (const [batchIndex, orderBatch] of orderBatches.entries()) {
            try {
                const transformedBatch = orderBatch.map((order) => {
                    const transformedResult = transformShopSiteOrder(order, profileIdMap, productIdMap);
                    return {
                        sourceOrderNumber: order.orderNumber,
                        transformedOrder: transformedResult.order,
                        transformedItems: transformedResult.items,
                    };
                });

                const orderRows = transformedBatch.map(({ transformedOrder }) => ({
                    order_number: transformedOrder.legacy_order_number,
                    user_id: transformedOrder.user_id,
                    customer_name: transformedOrder.customer_name,
                    customer_email: transformedOrder.customer_email,
                    status: transformedOrder.status,
                    subtotal: transformedOrder.subtotal,
                    tax: transformedOrder.tax,
                    total: transformedOrder.total,
                    created_at: transformedOrder.created_at,
                    payment_method: transformedOrder.payment_details.method === 'CreditCard' ? 'credit_card' : 'paypal',
                    notes: `Imported from ShopSite. Transaction ID: ${transformedOrder.shopsite_transaction_id || 'N/A'}`,
                    source: 'shopsite',
                    source_type: 'shopsite',
                    source_system: 'shopsite_15',
                    external_order_id: transformedOrder.legacy_order_number,
                    external_created_at: transformedOrder.created_at,
                    imported_at: new Date().toISOString(),
                    payment_status: 'paid',
                    fulfillment_status: 'fulfilled',
                }));

                const { data: upsertedOrders, error: orderError } = await supabase
                    .from('orders')
                    .upsert(orderRows, { onConflict: 'order_number' })
                    .select('id, order_number');

                if (orderError) {
                    throw orderError;
                }

                const orderIdByNumber = new Map<string, string>();
                for (const order of upsertedOrders ?? []) {
                    orderIdByNumber.set(order.order_number, order.id);
                }

                const upsertedOrderIds = Array.from(orderIdByNumber.values());
                if (upsertedOrderIds.length > 0) {
                    const { error: deleteError } = await supabase
                        .from('order_items')
                        .delete()
                        .in('order_id', upsertedOrderIds);

                    if (deleteError) {
                        throw deleteError;
                    }
                }

                const itemRows = transformedBatch.flatMap(({ transformedOrder, transformedItems }) => {
                    const orderId = orderIdByNumber.get(transformedOrder.legacy_order_number);
                    if (!orderId) {
                        return [];
                    }

                    return transformedItems.map((item) => ({
                        order_id: orderId,
                        item_type: 'product',
                        item_id: item.item_id || UUID_NIL,
                        item_name: `Product ${item.legacy_sku}`,
                        item_slug: item.legacy_sku,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.unit_price * item.quantity,
                    }));
                });

                if (itemRows.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('order_items')
                        .insert(itemRows);

                    if (itemsError) {
                        throw itemsError;
                    }
                }

                // 7. Persist order_source_records
                const sourceRecordRows = transformedBatch.map(({ sourceOrderNumber, transformedOrder }) => {
                    const orderId = orderIdByNumber.get(transformedOrder.legacy_order_number);
                    if (!orderId) return null;
                    return {
                        order_id: orderId,
                        source_type: 'shopsite',
                        source_system: 'shopsite_15',
                        external_id: sourceOrderNumber,
                        external_order_number: sourceOrderNumber,
                        raw_payload: transformedOrder.shopsite_data?.raw_xml ? { xml: transformedOrder.shopsite_data.raw_xml } : {},
                        normalized_payload: {
                            transaction_id: transformedOrder.shopsite_transaction_id || null,
                            billing_address: transformedOrder.billing_address || null,
                            shipping_address: transformedOrder.shipping_address || null,
                            payment_details: transformedOrder.payment_details || null,
                        },
                        sync_run_id: syncRunId,
                        external_created_at: transformedOrder.created_at || null,
                    };
                }).filter(Boolean);

                if (sourceRecordRows.length > 0) {
                    const { error: sourceError } = await supabase
                        .from('order_source_records')
                        .upsert(sourceRecordRows, { onConflict: 'source_type,source_system,external_id' });

                    if (sourceError) {
                        console.error('Failed to persist order source records:', sourceError.message);
                    }
                }

                // 8. Insert order_events for imported orders (deduplicated)
                const eventRows = transformedBatch.map(({ transformedOrder }) => {
                    const orderId = orderIdByNumber.get(transformedOrder.legacy_order_number);
                    if (!orderId) return null;
                    return {
                        order_id: orderId,
                        event_type: 'imported_from_shopsite',
                        note: `Imported from ShopSite order #${transformedOrder.legacy_order_number}`,
                    };
                }).filter(Boolean);

                if (eventRows.length > 0) {
                    // Check for existing events to prevent duplicates on repeat syncs
                    const orderIds = eventRows.map(e => e.order_id);
                    const { data: existingEvents } = await supabase
                        .from('order_events')
                        .select('order_id')
                        .in('order_id', orderIds)
                        .eq('event_type', 'imported_from_shopsite');

                    const existingOrderIds = new Set((existingEvents || []).map(e => e.order_id));
                    const newEventRows = eventRows.filter(e => !existingOrderIds.has(e.order_id));

                    if (newEventRows.length > 0) {
                        const { error: eventError } = await supabase.from('order_events').insert(newEventRows);
                        if (eventError) {
                            console.error('Failed to insert order events:', eventError.message);
                        }
                    }
                }

                created += orderRows.length;
                if ((batchIndex + 1) % 5 === 0 || batchIndex + 1 === orderBatches.length) {
                    console.log(`[Progress] Processed ${Math.min((batchIndex + 1) * ORDER_BATCH_SIZE, shopsiteOrders.length)}/${shopsiteOrders.length} orders...`);
                }
            } catch (err: any) {
                console.error(`Failed to process order batch ${batchIndex + 1}:`, err.message);
                failed += orderBatch.length;
                for (const order of orderBatch) {
                    errors.push({
                        record: order.orderNumber,
                        error: err.message,
                        timestamp: new Date().toISOString(),
                    });
                }
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

        if (syncRunId) {
            await completeIntegrationSyncRun(supabase, syncRunId, finalResult);
        }

        console.log('Order sync complete');
        console.log(JSON.stringify(finalResult, null, 2));

    } catch (error: any) {
        console.error('Fatal sync error:', error.message);
        const fatalResult: SyncResult = {
            success: false,
            processed: 0,
            created: 0,
            updated: 0,
            failed: 1,
            errors: [{ record: 'FATAL', error: error.message, timestamp: new Date().toISOString() }],
            duration: Date.now() - startedAt
        };

        if (logId) {
            await completeLog(supabase, logId, fatalResult);
        }

        if (syncRunId) {
            await completeIntegrationSyncRun(supabase, syncRunId, fatalResult);
        }
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Unhandled error in sync script:', error);
    process.exit(1);
});
