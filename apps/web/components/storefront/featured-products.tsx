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
      <div className="mb-8 flex items-center justify-between border-b-4 border-zinc-900 pb-2">
        <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter font-display">Featured Products</h2>
        <Button variant="ghost" asChild className="font-black uppercase text-xs tracking-widest hover:underline">
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
