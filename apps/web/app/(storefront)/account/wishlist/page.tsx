import { getWishlist } from '@/lib/account/data'
import { WishlistGrid } from '@/components/account/wishlist-grid'

export const metadata = {
    title: 'Wishlist',
    description: 'Your saved items.'
}

export default async function WishlistPage() {
    const wishlist = await getWishlist()

    return (
        <div className="space-y-12">
            <div className="border-b-2 border-brand-burgundy pb-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-zinc-900 font-display leading-tight">Wishlist</h1>
                <p className="text-zinc-600 font-medium text-sm mt-2">Save items to buy later.</p>
            </div>

            <WishlistGrid items={wishlist} />
        </div>
    )
}
