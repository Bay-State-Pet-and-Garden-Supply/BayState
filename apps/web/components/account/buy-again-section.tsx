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
            <div className="border border-dashed border-[oklch(85%_0.03_160)] p-12 text-center bg-muted rounded-sm">
                <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-xl text-foreground">No recurring purchases yet</h3>
                <p className="text-sm font-medium text-muted-foreground mt-2 max-w-sm mx-auto">
                    Products you order multiple times will appear here for quick reordering.
                </p>
                <Button asChild variant="outline" className="mt-6 border border-[oklch(85%_0.03_160)] rounded-sm font-medium tracking-wide">
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
            <div className="flex items-center gap-2">
                <RotateCcw className="h-6 w-6 text-foreground" />
                <h3 className="font-bold text-2xl tracking-tight font-display">Buy Again</h3>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => {
                    const imageSrc = formatImageUrl(product.images?.[0])
                    return (
                        <div key={product.id} className="border border-[oklch(85%_0.03_160)] bg-card shadow-sm hover:-translate-y-1 hover:shadow-md transition-all overflow-hidden flex flex-row rounded-sm">
                            <div className="w-28 h-28 shrink-0 bg-card border-r border-[oklch(85%_0.03_160)] p-2">
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        alt={product.name}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs bg-muted rounded-sm">
                                        No img
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                <div>
                                    <Link
                                        href={`/products/${product.slug}`}
                                        className="font-semibold text-sm tracking-tight leading-tight line-clamp-2 hover:text-primary transition-colors"
                                    >
                                        {product.name}
                                    </Link>
                                    <p className="text-[10px] font-medium tracking-wide text-muted-foreground mt-1">
                                        Ordered {product.order_count} times
                                    </p>
                                </div>

                                <div className="flex items-center justify-between mt-3">
                                    <span className="font-semibold text-lg tracking-tight">
                                        {formatCurrency(Number(product.price))}
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-8 px-3 gap-2 bg-[oklch(25%_0.02_90)] text-white hover:bg-[oklch(25%_0.02_90)]/90 rounded-sm font-medium tracking-wide text-xs"
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
