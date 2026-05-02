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
            <div className="border-b border-[oklch(85%_0.03_160)] pb-4">
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight font-display leading-none text-foreground">Wishlist</h1>
                <p className="text-muted-foreground font-medium tracking-wide text-sm mt-2">Save items to buy later.</p>
            </div>

            <WishlistGrid items={wishlist} />
        </div>
    )
}
