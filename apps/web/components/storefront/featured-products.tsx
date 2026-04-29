import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type Product } from '@/lib/data';
import { ProductCard } from './product-card';
import { Button } from '@/components/ui/button';

interface FeaturedProductsProps {
  products: Product[];
}

/**
 * FeaturedProducts - Grid display of featured products on homepage.
 */
export function FeaturedProducts({ products }: FeaturedProductsProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <div className="mb-8 flex items-center justify-between border-b border-[var(--surface-storefront-border)] pb-4">
        <div>
          <p className="storefront-kicker mb-2">Fresh picks</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-zinc-900">Featured products</h2>
        </div>
        <Button variant="ghost" asChild className="font-medium text-sm text-primary hover:bg-white">
          <Link href="/products">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
