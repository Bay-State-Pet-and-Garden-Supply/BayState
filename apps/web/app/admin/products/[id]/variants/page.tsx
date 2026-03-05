import { createClient } from '@/lib/supabase/server';
import { getProductVariants, getProductOptions } from '@/lib/admin/variants';
import { ProductVariantsClient } from '@/components/admin/products/variants/ProductVariantsClient';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default async function ProductVariantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, price')
    .eq('id', id)
    .single();
  
  if (!product) {
    notFound();
  }
  
  const [variants, options] = await Promise.all([
    getProductVariants(id),
    getProductOptions(id),
  ]);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/products">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Link>
        </Button>
      </div>
      
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="text-muted-foreground">Manage product options and variants</p>
      </div>
      
      <ProductVariantsClient
        productId={id}
        productName={product.name}
        basePrice={product.price}
        initialVariants={variants}
        initialOptions={options}
      />
    </div>
  );
}
