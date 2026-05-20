'use client'

import { ProductSummary } from '@/lib/account/types'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trash2, ShoppingCart, HeartOff } from 'lucide-react'
import { toggleFavoriteAction } from '@/lib/account/actions'
import { formatCurrency, formatImageUrl } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { useCartStore } from '@/lib/cart-store'
import { toast } from 'sonner'

export function FavoritesGrid({ items }: { items: ProductSummary[] }) {

    async function handleRemove(id: string) {
        if (!confirm('Remove this item from your favorites?')) return
        await toggleFavoriteAction(id)
        toast.success('Removed from favorites')
    }

    const addItem = useCartStore(state => state.addItem)

    function handleAddToCart(product: ProductSummary) {
        addItem({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: Number(product.price),
            imageUrl: formatImageUrl(product.images?.[0]) || null,
        })
        toast.success('Added to cart')
    }

    if (!items || items.length === 0) {
        return (
            <EmptyState
                icon={HeartOff}
                title="Your favorites list is empty"
                description="Save items you want to buy later. Heart icon on products adds them here."
                actionLabel="Browse Products"
                actionHref="/products"
                className="bg-transparent border-dashed"
            />
        )
    }

    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(product => {
                const imageSrc = formatImageUrl(product.images?.[0])

                return (
                    <div key={product.id} className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col group overflow-hidden transition-all hover:shadow-md">
                        <div className="aspect-square relative bg-white border-b border-zinc-50 overflow-hidden p-6">
                            {imageSrc ? (
                                <img
                                    src={imageSrc}
                                    alt={product.name}
                                    className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-zinc-300 bg-zinc-50 font-semibold text-xs font-body">
                                    No Image
                                </div>
                            )}
                            <div className="absolute top-4 right-4 bg-primary text-white px-3 py-1.5 text-sm font-bold shadow-sm rounded-xl tracking-tight">
                                {product.price ? formatCurrency(Number(product.price)) : formatCurrency(0)}
                            </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                            <h3 className="text-lg font-bold line-clamp-2 mb-6 font-display leading-tight group-hover:text-primary transition-colors text-zinc-900">
                                <Link href={`/products/${product.slug}`}>
                                    {product.name}
                                </Link>
                            </h3>

                            <div className="flex gap-3 mt-auto">
                                <Button 
                                    className="flex-1 rounded-xl font-semibold shadow-sm" 
                                    size="lg"
                                    onClick={() => handleAddToCart(product)}
                                >
                                    <ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-12 w-12 shrink-0 border border-zinc-200 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all shadow-sm"
                                    onClick={() => handleRemove(product.id)}
                                >
                                    <Trash2 className="h-5 w-5" />
                                    <span className="sr-only">Remove</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
