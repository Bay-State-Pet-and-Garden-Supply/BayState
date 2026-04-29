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
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Saved for later</p>
                <h1 className="storefront-section-title">Wishlist</h1>
                <p className="storefront-section-copy mt-3">Save items to buy later.</p>
            </div>

            <WishlistGrid items={wishlist} />
        </div>
    )
}
