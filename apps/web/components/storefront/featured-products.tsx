import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type Product } from '@/lib/data';
import { ProductCard } from './product-card';
import { Button } from '@/components/ui/button';
import { toTitleCase } from '@/lib/utils';

interface FeaturedProductsProps {
  products: Product[];
  title?: string;
}

/**
 * FeaturedProducts - Grid display of featured products on homepage.
 */
export function FeaturedProducts({ products, title }: FeaturedProductsProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <div className="mb-8 flex items-center justify-between border-b-2 border-primary/20 pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {title ? title : toTitleCase('Featured products')}
        </h2>
        <Button variant="ghost" asChild className="font-semibold text-xs tracking-widest hover:underline">
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
