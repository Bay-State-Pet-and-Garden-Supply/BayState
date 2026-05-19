import { ImageIcon } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { getProductImages } from '@/lib/admin/images';
import { ProductImagesClient } from '@/components/admin/products/images/ProductImagesClient';
import { notFound } from 'next/navigation';

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
    <AdminPageShell
      title={product.name}
      description="Manage product images and legacy image data for this storefront product."
      icon={<ImageIcon className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/products"
      backLabel="Back to products"
    >
      <ProductImagesClient
        productId={id}
        productName={product.name}
        initialImages={images}
        legacyImages={product.images as string[] | null}
      />
    </AdminPageShell>
  );
}
