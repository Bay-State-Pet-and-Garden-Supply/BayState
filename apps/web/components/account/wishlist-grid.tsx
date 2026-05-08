'use client'

import { ProductSummary } from '@/lib/account/types'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trash2, ShoppingCart, HeartOff } from 'lucide-react'
import { toggleWishlistAction } from '@/lib/account/actions'
import { formatCurrency, formatImageUrl } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

export function WishlistGrid({ items }: { items: ProductSummary[] }) {

    async function handleRemove(id: string) {
        // Optimistic update could happen here but server revalidation handles it
        if (!confirm('Remove this item from your wishlist?')) return
        await toggleWishlistAction(id)
    }

    if (!items || items.length === 0) {
        return (
            <EmptyState
                icon={HeartOff}
                title="Your wishlist is empty"
                description="Save items you want to buy later. Heart icon on products adds them here."
                actionLabel="Browse Products"
                actionHref="/products"
                className="bg-transparent border-dashed"
            />
        )
    }

    return (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(product => {
                const imageSrc = formatImageUrl(product.images?.[0])

                return (
                    <div key={product.id} className="border border-zinc-200 rounded-lg bg-white shadow-sm flex flex-col group overflow-hidden transition-all hover:shadow-md">
                        <div className="aspect-square relative bg-white border-b border-zinc-100 overflow-hidden p-6">
                            {imageSrc ? (
                                <img
                                    src={imageSrc}
                                    alt={product.name}
                                    className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-zinc-300 bg-zinc-50 font-bold uppercase tracking-widest text-[10px]">
                                    No Image
                                </div>
                            )}
                            <div className="absolute top-4 right-4 bg-brand-burgundy text-white px-3 py-1.5 text-sm font-bold shadow-sm rounded-sm tracking-tight">
                                {product.price ? formatCurrency(Number(product.price)) : formatCurrency(0)}
                            </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                            <h3 className="text-xl font-bold line-clamp-2 mb-4 font-display leading-tight group-hover:text-brand-forest-green transition-colors">
                                <Link href={`/products/${product.slug}`}>
                                    {product.name}
                                </Link>
                            </h3>

                            <div className="flex gap-3 mt-auto">
                                <Button className="flex-1 h-12 gap-2 bg-brand-forest-dark text-white hover:bg-brand-forest-green rounded-md font-bold text-xs uppercase tracking-widest border-b-4 border-black/20" size="sm">
                                    <ShoppingCart className="h-4 w-4" /> Add to Cart
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-12 w-12 shrink-0 border border-zinc-200 rounded-md text-brand-burgundy hover:text-white hover:bg-brand-burgundy transition-all shadow-sm"
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

