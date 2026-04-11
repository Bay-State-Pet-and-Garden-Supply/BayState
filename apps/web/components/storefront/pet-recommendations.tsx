import Link from 'next/link';
import { ArrowRight, Heart } from 'lucide-react';
import { ProductCard } from './product-card';
import { Button } from '@/components/ui/button';
import { getPersonalizedProducts } from '@/lib/recommendations';
import { createClient } from '@/lib/supabase/server';

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
      <div className="mb-8 flex items-center justify-between border-b-4 border-zinc-900 pb-2">
        <div className="flex items-center gap-3">
          <Heart className="h-6 w-6 text-rose-600 fill-rose-600" />
          <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter font-display">
            For {petNamesDisplay}
          </h2>
        </div>
        <Button variant="ghost" asChild className="font-black uppercase text-xs tracking-widest hover:underline">
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
