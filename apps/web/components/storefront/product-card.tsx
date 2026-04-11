import Link from 'next/link';
import Image from 'next/image';
import { type Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WishlistButton } from './wishlist-button';
import { formatCurrency, formatImageUrl } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

/**
 * ProductCard - Displays a product in grid layouts.
 * Shows image, name, price, stock status, and fulfillment badges.
 */
export function ProductCard({ product }: ProductCardProps) {
  const formattedPrice = formatCurrency(product.price);

  const rawImageSrc = product.images?.[0];
  const imageSrc = formatImageUrl(rawImageSrc);
  const hasValidImage = Boolean(imageSrc);

  return (
    <div className="group relative h-full">
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <WishlistButton productId={product.id} />
      </div>
      <Link href={`/products/${product.slug}`} className="block h-full">
        <Card className="h-full flex flex-col cursor-pointer overflow-hidden rounded-none border-2 border-zinc-200 bg-white transition-all group-hover:border-zinc-900 group-hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
          <CardContent className="flex flex-1 flex-col p-0">
            {/* Product Image Area */}
            <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-white p-4 border-b border-zinc-100">
              {hasValidImage ? (
                <div className="relative h-full w-full">
                  <Image
                    src={imageSrc!}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-50 text-zinc-300">
                  <ImageIcon className="size-[--icon-size-2xl]" />
                  <span className="text-xs font-black uppercase text-zinc-400">No Image</span>
                </div>
              )}
              
              {/* Badges Overlay - Solid and High Contrast */}
              <div className="absolute left-0 top-3 flex flex-col items-start gap-1">
                {product.stock_status === 'out_of_stock' && !product.is_special_order && (
                  <Badge className="rounded-none bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[10px] px-2 py-0.5 shadow-sm border-r-2 border-b-2 border-black/20">
                    Out of Stock
                  </Badge>
                )}
                {product.stock_status === 'pre_order' && (
                  <Badge className="rounded-none bg-accent text-secondary hover:bg-accent/90 font-black uppercase text-[10px] px-2 py-0.5 border-r-2 border-b-2 border-black/20">
                    Pre-Order
                  </Badge>
                )}
                {product.pickup_only && (
                  <Badge className="rounded-none bg-zinc-900 text-white font-black uppercase text-[10px] px-2 py-0.5 border-r-2 border-b-2 border-white/20">
                    Pickup Only
                  </Badge>
                )}
                {product.is_special_order && (
                  <Badge className="rounded-none bg-primary text-white font-black uppercase text-[10px] px-2 py-0.5 border-r-2 border-b-2 border-black/20">
                    Special Order
                  </Badge>
                )}
              </div>
            </div>

            {/* Product Info Area */}
            <div className="flex flex-1 flex-col p-4 pt-3">
              {product.brand && (
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-display">
                  {product.brand.name}
                </p>
              )}
              
              <h3 className="mb-2 line-clamp-2 text-sm font-bold uppercase tracking-tight text-zinc-800 leading-snug group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              
              {/* Tiered Pricing Section */}
              <div className="mt-auto flex flex-col gap-1 pt-2 border-t border-zinc-100">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black tracking-tighter text-zinc-900 font-display">
                    {formattedPrice}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
