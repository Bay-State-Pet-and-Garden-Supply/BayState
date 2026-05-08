import { createClient } from '@/lib/supabase/server'
import { Address, ProductSummary } from './types'
import { Order, getOrders as getOrdersBase } from '@/lib/orders'

export async function getAddresses(): Promise<Address[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching addresses:', error)
        return []
    }

    return data as Address[]
}

export async function getFavorites(): Promise<ProductSummary[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('wishlists')
        .select(`
            product_id,
            products!inner (
                id, name, slug, price, images, stock_status
            )
        `)
        .eq('user_id', user.id)
        .in('products.stock_status', ['in_stock', 'pre_order'])
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching favorites:', error)
        return []
    }

    // Supabase returns products as a single object for many-to-one relations
    return data
        .map((item) => item.products as unknown as ProductSummary)
        .filter(
            (p): p is ProductSummary =>
                p !== null &&
                p !== undefined &&
                (p.stock_status === 'in_stock' || p.stock_status === 'pre_order')
        )
}

export async function getUserOrders(): Promise<Order[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { orders } = await getOrdersBase({ userId: user.id })
    return orders
}
