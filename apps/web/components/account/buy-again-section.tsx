'use client'

import { FrequentProduct } from '@/lib/account/reorder'
import { Button } from '@/components/ui/button'
import { ShoppingCart, RotateCcw, Package } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatImageUrl } from '@/lib/utils'
import { useCartStore } from '@/lib/cart-store'
import { toast } from 'sonner'

interface BuyAgainSectionProps {
    products: FrequentProduct[]
}

export function BuyAgainSection({ products }: BuyAgainSectionProps) {
    const addItem = useCartStore(state => state.addItem)

    if (!products || products.length === 0) {
        return (
            <div className="border border-dashed border-zinc-200 p-12 text-center bg-zinc-50/50 rounded-2xl">
                <Package className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
                <h3 className="font-semibold text-lg text-zinc-900 font-display">No recurring purchases yet</h3>
                <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto font-body">
                    Products you order multiple times will appear here for quick reordering.
                </p>
                <Button asChild variant="outline" className="mt-6 rounded-xl font-semibold">
                    <Link href="/products">Start Shopping</Link>
                </Button>
            </div>
        )
    }

    function handleAddToCart(product: FrequentProduct) {
        addItem({
            id: product.id,
            name: product.name,
            slug: product.slug,
            price: Number(product.price),
            imageUrl: formatImageUrl(product.images?.[0]) || null,
        })
        toast.success('Added to cart')
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 border-l-4 border-primary pl-4">
                <RotateCcw className="h-6 w-6 text-primary" />
                <h3 className="text-xl font-bold font-display text-zinc-900">Buy Again</h3>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(product => {
                    const imageSrc = formatImageUrl(product.images?.[0])
                    
                    return (
                        <div key={product.id} className="border border-zinc-200 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-row group">
                            <div className="w-24 h-24 shrink-0 bg-white border-r border-zinc-100 p-2">
                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        alt={product.name}
                                        className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-300 text-[10px] font-semibold bg-zinc-50 rounded-lg">
                                        No img
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                                <div className="space-y-1">
                                    <Link
                                        href={`/products/${product.slug}`}
                                        className="font-semibold text-sm leading-snug line-clamp-2 hover:text-primary transition-colors font-body text-zinc-900"
                                    >
                                        {product.name}
                                    </Link>
                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                                        Ordered {product.order_count}x
                                    </p>
                                </div>
                
                                <div className="flex items-center justify-between mt-2">
                                    <span className="font-bold text-base text-zinc-900 font-body">
                                        {formatCurrency(Number(product.price))}
                                    </span>
                                    <Button
                                        size="sm"
                                        className="h-8 px-3 rounded-lg font-semibold text-xs shadow-sm"
                                        onClick={() => handleAddToCart(product)}
                                    >
                                        <ShoppingCart className="h-3 w-3 mr-1.5" />
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
