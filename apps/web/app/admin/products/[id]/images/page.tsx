import { createClient } from '@/lib/supabase/server';
import { getProductImages } from '@/lib/admin/images';
import { ProductImagesClient } from '@/components/admin/products/images/ProductImagesClient';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default async function ProductImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, images')
    .eq('id', id)
    .single();
  
  if (!product) {
    notFound();
  }
  
  const images = await getProductImages(id);
  
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
        <p className="text-muted-foreground">Manage product images</p>
      </div>
      
      <ProductImagesClient
        productId={id}
        productName={product.name}
        initialImages={images}
        legacyImages={product.images as string[] | null}
      />
    </div>
  );
}
