/**
 * Order Synchronization Utilities
 * 
 * Handles transformation and sync of orders from ShopSite to Supabase.
 */

import { ShopSiteOrder, ShopSiteOrderItem, AddressInfo } from './types';

/**
 * Transform a ShopSite order into the Supabase orders table format.
 */
export function transformShopSiteOrder(
    order: ShopSiteOrder,
    profileIdMap: Map<string, string>, // email -> profile id
    productIdMap: Map<string, string>  // sku -> product id
): {
    order: {
        legacy_order_number: string;
        user_id: string | null;
        status: string;
        subtotal: number;
        tax: number;
        shipping: number;
        total: number;
        customer_name: string;
        customer_email: string;
        created_at: string;
        is_legacy_import: boolean;
        shopsite_transaction_id?: string;
        billing_address?: AddressInfo;
        shipping_address?: AddressInfo;
        payment_details: { method?: string; grandTotal: number; tax: number; shipping: number };
        shopsite_data: { raw_xml: unknown } | Record<string, never>;
    };
    items: Array<{
        item_id: string | null;
        item_type: string;
        quantity: number;
        unit_price: number;
        legacy_sku: string;
    }>;
} {
    // Try to find the profile by email
    const userId = order.customerEmail
        ? profileIdMap.get(order.customerEmail.toLowerCase().trim()) || null
        : null;

    // Calculate subtotal (total - tax - shipping)
    const subtotal = order.grandTotal - order.tax - order.shippingTotal;

    // Transform order items
    const items = order.items.map((item: ShopSiteOrderItem) => ({
        item_id: productIdMap.get(item.sku) || null,
        item_type: 'product',
        quantity: item.quantity,
        unit_price: item.price,
        legacy_sku: item.sku,
    }));

    return {
        order: {
            legacy_order_number: order.orderNumber,
            user_id: userId,
            status: 'completed', // Historical orders are assumed completed
            subtotal: subtotal > 0 ? subtotal : 0,
            tax: order.tax,
            shipping: order.shippingTotal,
            total: order.grandTotal,
            customer_name: order.billingAddress?.fullName || 'Guest',
            customer_email: order.customerEmail || '',
            created_at: order.orderDate || new Date().toISOString(),
            is_legacy_import: true,
            shopsite_transaction_id: order.transactionId,
            billing_address: order.billingAddress,
            shipping_address: order.shippingAddress,
            payment_details: {
                method: order.paymentMethod,
                grandTotal: order.grandTotal,
                tax: order.tax,
                shipping: order.shippingTotal,
            },
            shopsite_data: order.rawXml ? { raw_xml: order.rawXml } : {},
        },
        items,
    };
}

/**
 * Batch orders into chunks for efficient processing.
 */
export function batchOrders<T>(orders: T[], batchSize: number = 50): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < orders.length; i += batchSize) {
        batches.push(orders.slice(i, i + batchSize));
    }
    return batches;
}
