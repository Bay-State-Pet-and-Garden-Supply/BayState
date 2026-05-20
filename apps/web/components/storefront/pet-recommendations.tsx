import Link from 'next/link';
import { ArrowRight, Heart } from 'lucide-react';
import { ProductCard } from './product-card';
import { Button } from '@/components/ui/button';
import { getPersonalizedProducts } from '@/lib/recommendations';
import { createClient } from '@/lib/supabase/server';
import { toTitleCase } from '@/lib/utils';

export async function PetRecommendations() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const products = await getPersonalizedProducts(user.id, 6);

  if (products.length === 0) {
    return null;
  }

  const petNames = [...new Set(products.map((p) => p.petName))];
  const petNamesDisplay = petNames.length > 2
    ? `${petNames.slice(0, 2).join(', ')} & more`
    : petNames.join(' & ');

  return (
    <section className="mb-12">
      <div className="mb-8 flex items-center justify-between border-b-2 border-primary/20 pb-4">
        <div className="flex items-center gap-4">
          <Heart className="h-8 w-8 text-rose-600 fill-rose-600" />
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            For {toTitleCase(petNamesDisplay)}
          </h2>
        </div>
        <Button variant="outline" asChild className="font-bold border-2 border-brand-burgundy text-brand-burgundy rounded-none px-6">
          <Link href="/account/pets">
            Manage Pets
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
