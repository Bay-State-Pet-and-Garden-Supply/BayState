'use client'

import { FrequentProduct } from '@/lib/account/reorder'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShoppingCart, RotateCcw, Package } from 'lucide-react'
import Link from 'next/link'

interface BuyAgainSectionProps {
    products: FrequentProduct[]
}

export function BuyAgainSection({ products }: BuyAgainSectionProps) {
    if (!products || products.length === 0) {
        return (
            <div className="rounded-lg border-2 border-dashed border-zinc-200 p-8 text-center">
                <Package className="mx-auto h-10 w-10 text-zinc-300 mb-3" />
                <h3 className="font-medium text-zinc-900">No recurring purchases yet</h3>
                <p className="text-sm text-zinc-600 mt-1 max-w-sm mx-auto">
                    Products you order multiple times will appear here for quick reordering.
                </p>
            </div>
        )
    }

    async function handleAddToCart(productId: string) {
        // TODO: Integrate with cart store/action
        console.log('Add to cart:', productId)
        // For now, just show alert
        alert('Added to cart! (Cart integration coming soon)')
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-zinc-500" />
                <h3 className="font-semibold text-lg">Buy Again</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => (
                    <Card key={product.id} className="overflow-hidden">
                        <div className="flex h-full">
                            {/* Thumbnail */}
                            <div className="w-24 h-24 shrink-0 bg-zinc-100">
                                {product.images && product.images[0] ? (
                                    <img
                                        src={product.images[0]}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">
                                        No img
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <CardContent className="flex-1 p-3 flex flex-col justify-between">
                                <div>
                                    <Link
                                        href={`/products/${product.slug}`}
                                        className="font-medium text-sm line-clamp-2 hover:underline"
                                    >
                                        {product.name}
                                    </Link>
                                    <p className="text-xs text-zinc-600 mt-1">
                                        Ordered {product.order_count} times
                                    </p>
                                </div>

                                <div className="flex items-center justify-between mt-2">
                                    <span className="font-semibold text-sm">
                                        ${Number(product.price).toFixed(2)}
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-7 px-2 gap-1"
                                        onClick={() => handleAddToCart(product.id)}
                                    >
                                        <ShoppingCart className="h-3 w-3" />
                                        Add
                                    </Button>
                                </div>
                            </CardContent>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}
