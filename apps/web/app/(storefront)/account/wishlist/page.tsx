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
            <div className="border-b-8 border-zinc-900 pb-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">Wishlist</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">Save items to buy later.</p>
            </div>

            <WishlistGrid items={wishlist} />
        </div>
    )
}

