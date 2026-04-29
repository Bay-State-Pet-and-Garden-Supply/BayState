import { History } from 'lucide-react';
import { ProductCard } from '@/components/storefront/product-card';
import { type Product } from '@/lib/data';

interface RecentlyViewedSectionProps {
  products: Array<{
    id: string;
    name: string;
    slug: string;
    price: number;
    images: string[];
    stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  }>;
}

/**
 * RecentlyViewedSection
 * 
 * A server component that displays a horizontally scrollable list of recently viewed products.
 * Uses CSS snap scrolling for a smooth native-like feel.
 */
export function RecentlyViewedSection({ products }: RecentlyViewedSectionProps) {
  // Return null if no products to display
  if (!products || products.length === 0) {
    return null;
  }

  return (
    <section className="w-full py-8 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="container mx-auto px-4 md:px-6">
        {/* Section Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-secondary/10 rounded-full">
            <History className="w-5 h-5 text-secondary" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Recently Viewed
          </h2>
        </div>

        {/* Scrollable Container */}
        <div 
          className="
            flex gap-4 overflow-x-auto pb-6 -mx-4 px-4 
            snap-x snap-mandatory 
            scrollbar-hide 
            [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]
          "
        >
          {products.map((product) => (
            <div 
              key={product.id} 
              className="snap-start shrink-0 w-[45%] sm:w-[33%] md:w-[25%] lg:w-[20%]"
            >
              <ProductCard 
                product={product as unknown as Product} 
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
