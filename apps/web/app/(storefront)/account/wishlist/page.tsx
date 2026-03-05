import { getWishlist } from '@/lib/account/data'
import { WishlistGrid } from '@/components/account/wishlist-grid'

export const metadata = {
    title: 'Wishlist',
    description: 'Your saved items.'
}

export default async function WishlistPage() {
    const wishlist = await getWishlist()

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Wishlist</h2>
                <p className="text-muted-foreground">Save items to buy later.</p>
            </div>

            <WishlistGrid items={wishlist} />
        </div>
    )
}
