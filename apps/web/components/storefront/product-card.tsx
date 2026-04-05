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
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-[--animate-duration-slow]">
        <WishlistButton productId={product.id} />
      </div>
      <Link href={`/products/${product.slug}`} className="block h-full">
        <Card className="h-full flex flex-col cursor-pointer overflow-hidden border-zinc-200 bg-white transition-all duration-[--animate-duration-slow] hover:shadow-lg hover:border-zinc-300">
          <CardContent className="flex flex-1 flex-col p-0">
            {/* Product Image Area */}
            <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-white p-4">
              {hasValidImage ? (
                <div className="relative h-full w-full">
                  <Image
                    src={imageSrc!}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-contain transition-transform duration-[--animate-duration-slower] group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-50 text-zinc-300 rounded-md">
                  <ImageIcon className="size-[--icon-size-2xl]" />
                  <span className="text-xs font-medium text-zinc-400">No Image</span>
                </div>
              )}
              
              {/* Badges Overlay */}
              <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
                {product.stock_status === 'out_of_stock' && !product.is_special_order && (
                  <Badge variant="destructive" className="bg-[--color-stock-out-bg] hover:bg-[--color-stock-out-bg-hover] text-[--color-stock-out-text] shadow-sm">
                    Out of Stock
                  </Badge>
                )}
                {product.stock_status === 'pre_order' && (
                  <Badge variant="secondary" className="bg-[--color-stock-preorder-bg] text-[--color-stock-preorder-text] hover:bg-[--color-stock-preorder-bg-hover] border-[--color-stock-preorder-border] shadow-sm">
                    Pre-Order
                  </Badge>
                )}
                {product.pickup_only && (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200 shadow-sm">
                    Pickup Only
                  </Badge>
                )}
                {product.is_special_order && (
                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 shadow-sm">
                    Special Order
                  </Badge>
                )}
              </div>
            </div>

            {/* Product Info Area */}
            <div className="flex flex-1 flex-col p-4 pt-2">
              {product.brand && (
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {product.brand.name}
                </p>
              )}
              
              <h3 className="mb-2 line-clamp-2 text-sm font-medium leading-tight text-zinc-800 group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              
              {/* Tiered Pricing Section */}
              <div className="mt-auto flex flex-col gap-1 pt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-zinc-900">
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
