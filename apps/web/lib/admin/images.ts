'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ProductImage } from '@/lib/types';

export async function getProductImages(productId: string): Promise<ProductImage[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('position', { ascending: true });
  
  if (error) {
    console.error('Error fetching product images:', error);
    return [];
  }
  
  return data as ProductImage[];
}

export async function createProductImage(
  productId: string,
  imageData: {
    url: string;
    alt_text?: string;
    variant_id?: string;
    is_primary?: boolean;
  }
): Promise<{ success: boolean; image?: ProductImage; error?: string }> {
  const supabase = await createClient();
  
  const { data: existingImages } = await supabase
    .from('product_images')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1);
  
  const nextPosition = existingImages?.[0]?.position !== undefined 
    ? existingImages[0].position + 1 
    : 0;
  
  if (imageData.is_primary) {
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);
  }
  
  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      url: imageData.url,
      alt_text: imageData.alt_text || null,
      variant_id: imageData.variant_id || null,
      position: nextPosition,
      is_primary: imageData.is_primary ?? (nextPosition === 0),
    })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath(`/admin/products/${productId}`);
  return { success: true, image: data as ProductImage };
}

export async function updateProductImage(
  imageId: string,
  updates: Partial<Pick<ProductImage, 'url' | 'alt_text' | 'position' | 'is_primary'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  if (updates.is_primary) {
    const { data: image } = await supabase
      .from('product_images')
      .select('product_id')
      .eq('id', imageId)
      .single();
    
    if (image) {
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', image.product_id);
    }
  }
  
  const { error } = await supabase
    .from('product_images')
    .update(updates)
    .eq('id', imageId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function deleteProductImage(
  imageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function setImageAsPrimary(
  imageId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  await supabase
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId);
  
  const { error } = await supabase
    .from('product_images')
    .update({ is_primary: true })
    .eq('id', imageId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath(`/admin/products/${productId}`);
  return { success: true };
}
