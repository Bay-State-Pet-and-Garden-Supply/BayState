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
                    <div key={product.id} className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(225,29,72,1)] flex flex-col group overflow-hidden transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
                        <div className="aspect-square relative bg-white border-b-4 border-zinc-900 overflow-hidden p-4">
                            {imageSrc ? (
                                <img
                                    src={imageSrc}
                                    alt={product.name}
                                    className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-500"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-zinc-300 bg-zinc-50 font-black uppercase tracking-widest text-xs">
                                    No Image
                                </div>
                            )}
                            <div className="absolute top-4 right-4 bg-zinc-900 text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.2)]">
                                {product.price ? formatCurrency(Number(product.price)) : formatCurrency(0)}
                            </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                            <h3 className="text-xl font-black uppercase tracking-tighter line-clamp-2 mb-4 font-display leading-none group-hover:text-primary transition-colors">
                                <Link href={`/products/${product.slug}`}>
                                    {product.name}
                                </Link>
                            </h3>

                            <div className="flex gap-3 mt-auto">
                                <Button className="flex-1 h-12 gap-2 bg-zinc-900 text-white hover:bg-zinc-800 rounded-none font-black uppercase text-xs tracking-widest border-b-4 border-black/20" size="sm">
                                    <ShoppingCart className="h-4 w-4" /> Add to Cart
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-12 w-12 shrink-0 border-2 border-zinc-900 rounded-none text-red-600 hover:text-white hover:bg-red-600 transition-colors shadow-[4px_4px_0px_rgba(0,0,0,0.1)]"
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

