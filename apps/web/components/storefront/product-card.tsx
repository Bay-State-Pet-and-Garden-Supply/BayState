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
        <Card className="h-full cursor-pointer overflow-hidden border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-card)] shadow-[var(--shadow-warm-sm)] transition-all group-hover:border-[var(--surface-storefront-accent)] group-hover:shadow-[var(--shadow-warm-md)] group-hover:-translate-y-1">
          <CardContent className="flex flex-1 flex-col p-0">
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
                  <span className="text-xs font-medium text-zinc-400">No image</span>
                </div>
              )}
              
              <div className="absolute left-0 top-3 flex flex-col items-start gap-1">
                {product.stock_status === 'out_of_stock' && !product.is_special_order && (
                  <Badge className="bg-red-600 text-white text-[10px] shadow-none">
                    Out of Stock
                  </Badge>
                )}
                {product.stock_status === 'pre_order' && (
                  <Badge className="bg-accent text-secondary text-[10px] shadow-none">
                    Pre-Order
                  </Badge>
                )}
                {product.pickup_only && (
                  <Badge className="bg-zinc-900 text-white text-[10px] shadow-none">
                    Pickup Only
                  </Badge>
                )}
                {product.is_special_order && (
                  <Badge className="bg-primary text-white text-[10px] shadow-none">
                    Special Order
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-4 pt-3">
              {product.brand && (
                <p className="mb-1 text-[11px] font-medium tracking-[0.08em] text-zinc-400">
                  {product.brand.name}
                </p>
              )}
              
              <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug text-zinc-800 transition-colors group-hover:text-primary">
                {product.name}
              </h3>
              
              <div className="mt-auto flex flex-col gap-1 pt-2 border-t border-zinc-100">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-xl font-bold tracking-tight text-zinc-900">
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
