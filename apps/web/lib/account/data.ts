import { createClient } from '@/lib/supabase/server'
import { Address, ProductSummary } from './types'
import { Order } from '@/lib/orders'

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

export async function getWishlist(): Promise<ProductSummary[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('wishlists')
        .select(`
            product_id,
            products (
                id, name, slug, price, images, stock_status
            )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching wishlist:', error)
        return []
    }

    // Supabase returns products as a single object for many-to-one relations
    return data
        .map((item) => item.products as unknown as ProductSummary)
        .filter((p): p is ProductSummary => p !== null && p !== undefined)
}

export async function getOrders(): Promise<Order[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching orders:', error)
        return []
    }

    return data as Order[]
}
