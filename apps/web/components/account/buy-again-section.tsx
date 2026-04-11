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
            <div className="border-4 border-dashed border-zinc-200 p-12 text-center bg-zinc-50">
                <Package className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
                <h3 className="font-black uppercase tracking-tight text-xl text-zinc-900">No recurring purchases yet</h3>
                <p className="text-sm font-medium text-zinc-600 mt-2 max-w-sm mx-auto">
                    Products you order multiple times will appear here for quick reordering.
                </p>
                <Button asChild variant="outline" className="mt-6 border-2 border-zinc-900 rounded-none font-black uppercase tracking-tight">
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
            <div className="flex items-center gap-2 border-l-8 border-accent pl-4">
                <RotateCcw className="h-6 w-6 text-zinc-900" />
                <h3 className="font-black text-2xl uppercase tracking-tighter font-display">Buy Again</h3>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => {
                    const imageSrc = formatImageUrl(product.images?.[0])
                    
                    return (
                        <div key={product.id} className="border-4 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] transition-all overflow-hidden flex flex-row">
                            {/* Thumbnail */}
                            <div className="w-28 h-28 shrink-0 bg-white border-r-4 border-zinc-900 p-2">
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        alt={product.name}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs font-black uppercase bg-zinc-50">
                                        No img
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                <div>
                                    <Link
                                        href={`/products/${product.slug}`}
                                        className="font-black text-sm uppercase leading-tight line-clamp-2 hover:text-primary transition-colors"
                                    >
                                        {product.name}
                                    </Link>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">
                                        Ordered {product.order_count} times
                                    </p>
                                </div>
                
                                <div className="flex items-center justify-between mt-3">
                                    <span className="font-black text-lg tracking-tighter">
                                        {formatCurrency(Number(product.price))}
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-8 px-3 gap-2 bg-zinc-900 text-white hover:bg-zinc-800 rounded-none font-black uppercase text-xs"
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


