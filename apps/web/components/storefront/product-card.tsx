import Link from 'next/link';
import Image from 'next/image';
import type { Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FavoritesButton } from './favorites-button';
import { cn, formatCurrency, formatImageUrl } from '@/lib/utils';
import { ImageIcon, MapPin, ShoppingBag } from 'lucide-react';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const imageSrc = formatImageUrl(product.images?.[0]);
  const hasValidImage = Boolean(imageSrc);
  const isOutOfStock = product.stock_status === 'out_of_stock';
  const isPickupOnly = Boolean(product.pickup_only);
  const isPreorder = product.stock_status === 'pre_order';
  const isSpecialOrder = Boolean(product.is_special_order);

  return (
    <div className="group relative h-full">
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <FavoritesButton productId={product.id} />
      </div>
      <Link href={`/products/${product.slug}`} className="block h-full">
        <Card
          className={cn(
            'flex h-full cursor-pointer flex-col overflow-hidden border-border bg-card transition-all',
            !isOutOfStock && 'group-hover:-translate-y-0.5 group-hover:border-primary/20 group-hover:shadow-sm',
            isOutOfStock && 'opacity-70',
          )}
        >
          <CardContent className="flex flex-1 flex-col p-0">
            <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-border bg-muted/20 p-4">
              {hasValidImage ? (
                <div
                  className={cn(
                    'relative h-full w-full transition-all duration-300',
                    isOutOfStock && 'grayscale opacity-60',
                  )}
                >
                  <Image
                    src={imageSrc!}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground/40">
                  <ImageIcon className="size-10" />
                  <span className="text-xs font-medium">No image</span>
                </div>
              )}

              <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
                {isOutOfStock ? (
                  <Badge variant="destructive">Out of stock</Badge>
                ) : null}
                {isPreorder ? <Badge variant="warning">Pre-order</Badge> : null}
                {isPickupOnly ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-200 bg-amber-50 text-amber-800"
                  >
                    <MapPin className="h-3 w-3" />
                    Pickup only
                  </Badge>
                ) : null}
                {isSpecialOrder ? <Badge variant="secondary">Special order</Badge> : null}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-4">
              {product.brand ? (
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {product.brand.name}
                </p>
              ) : null}

              <h3 className="mb-3 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                {product.name}
              </h3>

              <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-foreground tabular-nums">
                    {formatCurrency(product.price)}
                  </span>
                </div>

                {!isOutOfStock ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {isPickupOnly ? 'Pickup in store' : 'Delivery or pickup'}
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
