import { getFavorites } from '@/lib/account/data'
import { FavoritesGrid } from '@/components/account/favorites-grid'

export const metadata = {
    title: 'Favorites',
    description: 'Your saved items.'
}

export default async function FavoritesPage() {
    const favorites = await getFavorites()

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Favorites</h1>
                <p className="text-zinc-500 font-body mt-1">Save items to buy later.</p>
            </div>

            <FavoritesGrid items={favorites} />
        </div>
    )
}
