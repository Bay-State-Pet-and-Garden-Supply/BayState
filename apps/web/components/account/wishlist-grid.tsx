'use client'

import { ProductSummary } from '@/lib/account/types'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trash2, ShoppingCart, HeartOff } from 'lucide-react'
import { toggleWishlistAction } from '@/lib/account/actions'
import { formatCurrency } from '@/lib/utils'
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(product => (
                <Card key={product.id} className="overflow-hidden group">
                    <div className="aspect-square relative bg-zinc-100">
                        {product.images && product.images[0] ? (
                            <img
                                src={product.images[0]}
                                alt={product.name}
                                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-300 bg-zinc-50">
                                No Image
                            </div>
                        )}
                    </div>
                    <CardContent className="p-4">
                        <h3 className="font-semibold text-lg line-clamp-1 mb-1">
                            <Link href={`/products/${product.slug}`} className="hover:underline">
                                {product.name}
                            </Link>
                        </h3>
                        <div className="text-zinc-600 mb-4 text-sm font-medium">
                            {product.price ? formatCurrency(Number(product.price)) : formatCurrency(0)}
                        </div>

                        <div className="flex gap-2">
                            <Button className="w-full flex-1 gap-2" size="sm">
                                <ShoppingCart className="h-4 w-4" /> Add to Cart
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemove(product.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Remove</span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
