'use client'

import { FrequentProduct } from '@/lib/account/reorder'
import { Button } from '@/components/ui/button'
import { ShoppingCart, RotateCcw, Package } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatImageUrl } from '@/lib/utils'

interface BuyAgainSectionProps {
    products: FrequentProduct[]
}

export function BuyAgainSection({ products }: BuyAgainSectionProps) {
    if (!products || products.length === 0) {
        return (
            <div className="storefront-panel-soft border-dashed p-12 text-center">
                <Package className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
                <h3 className="text-xl font-semibold text-zinc-900">No recurring purchases yet</h3>
                <p className="text-sm font-medium text-zinc-600 mt-2 max-w-sm mx-auto">
                    Products you order multiple times will appear here for quick reordering.
                </p>
                <Button asChild variant="outline" className="mt-6 rounded-xl">
                    <Link href="/products">Start Shopping</Link>
                </Button>
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
        <div className="space-y-6">
            <div className="border-b border-[var(--surface-storefront-border)] pb-4">
                <p className="storefront-kicker mb-2">Reorder favorites</p>
                <div className="flex items-center gap-2">
                <RotateCcw className="h-6 w-6 text-zinc-900" />
                <h3 className="font-display text-2xl font-bold text-zinc-900">Buy again</h3>
                </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => {
                    const imageSrc = formatImageUrl(product.images?.[0])
                    
                    return (
                        <div key={product.id} className="storefront-panel flex flex-row overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-warm-md)]">
                            <div className="h-28 w-28 shrink-0 border-r border-[var(--surface-storefront-border)] bg-white p-2">
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        alt={product.name}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-zinc-50 text-xs font-medium text-zinc-300">
                                        No img
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                <div>
                                    <Link
                                        href={`/products/${product.slug}`}
                                        className="line-clamp-2 text-sm font-semibold leading-tight transition-colors hover:text-primary"
                                    >
                                        {product.name}
                                    </Link>
                                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                                        Ordered {product.order_count} times
                                    </p>
                                </div>
                
                                <div className="flex items-center justify-between mt-3">
                                    <span className="text-lg font-semibold text-zinc-900">
                                        {formatCurrency(Number(product.price))}
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-8 gap-2 rounded-full bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                                        onClick={() => handleAddToCart(product.id)}
                                    >
                                        <ShoppingCart className="h-3 w-3" />
                                        Add
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

