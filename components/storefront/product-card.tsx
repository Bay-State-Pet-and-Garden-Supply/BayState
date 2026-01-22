import Link from 'next/link';
import Image from 'next/image';
import { type Product } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WishlistButton } from './wishlist-button';
import { formatCurrency } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

/**
 * ProductCard - Displays a product in grid layouts.
 * Shows image, name, price, and stock status.
 */
export function ProductCard({ product }: ProductCardProps) {
  const formattedPrice = formatCurrency(product.price);

  const imageSrc = product.images?.[0]?.trim();
  const hasValidImage = Boolean(imageSrc) && (imageSrc?.startsWith('/') || imageSrc?.startsWith('http'));

  return (
    <div className="group relative h-full">
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-[--animate-duration-slow]">
        <WishlistButton productId={product.id} />
      </div>
      <Link href={`/products/${product.slug}`} className="block h-full">
        <Card className="h-full cursor-pointer overflow-hidden border-zinc-200 bg-white transition-all duration-[--animate-duration-slow] hover:shadow-lg hover:border-zinc-300">
          <CardContent className="flex h-full flex-col p-0">
            {/* Product Image */}
            <div className="relative aspect-square w-full overflow-hidden bg-zinc-50">
              {hasValidImage ? (
                <Image
                  src={imageSrc!}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-[--animate-duration-slower] group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-300">
                  <ImageIcon className="size-[--icon-size-2xl]" />
                  <span className="text-xs font-[--font-weight-medium] text-zinc-400">No Image</span>
                </div>
              )}
              
              <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                {product.stock_status === 'out_of_stock' && (
                  <Badge variant="destructive" className="bg-[--color-stock-out-bg] hover:bg-[--color-stock-out-bg-hover] text-[--color-stock-out-text] shadow-sm">
                    Out of Stock
                  </Badge>
                )}
                {product.stock_status === 'pre_order' && (
                  <Badge variant="secondary" className="bg-[--color-stock-preorder-bg] text-[--color-stock-preorder-text] hover:bg-[--color-stock-preorder-bg-hover] border-[--color-stock-preorder-border] shadow-sm">
                    Pre-Order
                  </Badge>
                )}
              </div>
            </div>

            {/* Product Info */}
            <div className="flex flex-1 flex-col p-4">
              {product.brand && (
                <p className="mb-1 text-xs font-[--font-weight-medium] uppercase tracking-wider text-zinc-500">
                  {product.brand.name}
                </p>
              )}
              
              <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-[--font-weight-semibold] leading-tight text-zinc-900 group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              
              <div className="mt-auto flex items-end justify-between pt-2">
                <span className="text-lg font-[--font-weight-bold] tracking-tight text-zinc-900">
                  {formattedPrice}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
