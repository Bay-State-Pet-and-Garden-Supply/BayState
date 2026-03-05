'use server'

import { createClient } from '@/lib/supabase/server'

export interface FrequentProduct {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: string[];
    order_count: number;
}

/**
 * Get products that the current user has ordered multiple times.
 * Returns products sorted by order frequency (most ordered first).
 */
export async function getFrequentlyBoughtProducts(limit = 6): Promise<FrequentProduct[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    // Query: Get all product items in user's orders
    const { data, error } = await supabase
        .from('orders')
        .select(`
            user_id,
            order_items!inner (
                item_id,
                item_name,
                item_slug,
                unit_price,
                item_type
            )
        `)
        .eq('user_id', user.id)
        .eq('order_items.item_type', 'product')

    if (error) {
        console.error('Error fetching order history:', error)
        return []
    }

    if (!data || data.length === 0) return []

    // Aggregate: Count occurrences per product (flatten items from all orders)
    const productCounts = new Map<string, {
        id: string;
        name: string;
        slug: string;
        price: number;
        count: number
    }>()

    for (const order of data) {
        const items = order.order_items as Array<{ item_id: string; item_name: string; item_slug: string; unit_price: string | number; item_type: string }>
        for (const item of items) {
            const itemId = item.item_id
            const existing = productCounts.get(itemId)
            if (existing) {
                existing.count++
            } else {
                productCounts.set(itemId, {
                    id: itemId,
                    name: item.item_name,
                    slug: item.item_slug,
                    price: parseFloat(String(item.unit_price)),
                    count: 1
                })
            }
        }
    }

    // Filter: Products ordered more than once, sorted by frequency
    const qualifiedEntries = Array.from(productCounts.values())
        .filter(entry => entry.count > 1)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)

    if (qualifiedEntries.length === 0) return []

    // Fetch images for these products
    const productIds = qualifiedEntries.map(e => e.id)
    const { data: productsData } = await supabase
        .from('products')
        .select('id, images')
        .in('id', productIds)

    const imageMap = new Map(productsData?.map(p => [p.id, p.images]) || [])

    return qualifiedEntries.map(entry => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        price: entry.price,
        images: (imageMap.get(entry.id) as string[]) || [],
        order_count: entry.count
    }))
}

/**
 * Get the user's most recent orders for display.
 */
export async function getRecentOrders(limit = 5) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Error fetching recent orders:', error)
        return []
    }

    return data || []
}
