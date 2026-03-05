'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const BUCKET_NAME = 'product-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface UploadResult {
  success: boolean;
  error?: string;
  storagePath?: string;
  publicUrl?: string;
}

export async function uploadProductImage(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();

  const file = formData.get('file') as File | null;
  const productId = formData.get('productId') as string | null;
  const altText = formData.get('altText') as string | null;
  const isPrimary = formData.get('isPrimary') === 'true';

  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  if (!productId) {
    return { success: false, error: 'Product ID is required' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const storagePath = `${productId}/${timestamp}-${randomSuffix}.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload error:', uploadError);
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  if (isPrimary) {
    await supabase
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);
  }

  const { data: existingImages } = await supabase
    .from('product_images')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existingImages?.[0]?.position != null 
    ? existingImages[0].position + 1 
    : 0;

  const { error: dbError } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      url: publicUrl,
      storage_path: storagePath,
      alt_text: altText || null,
      is_primary: isPrimary,
      position: nextPosition,
    });

  if (dbError) {
    await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    console.error('Database error:', dbError);
    return { success: false, error: `Failed to save image record: ${dbError.message}` };
  }

  revalidatePath(`/admin/products/${productId}/images`);
  revalidatePath(`/admin/products`);

  return { success: true, storagePath, publicUrl };
}

export async function deleteProductImage(imageId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: image, error: fetchError } = await supabase
    .from('product_images')
    .select('storage_path, product_id')
    .eq('id', imageId)
    .single();

  if (fetchError || !image) {
    return { success: false, error: 'Image not found' };
  }

  if (image.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([image.storage_path]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
    }
  }

  const { error: dbError } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId);

  if (dbError) {
    return { success: false, error: `Failed to delete image record: ${dbError.message}` };
  }

  revalidatePath(`/admin/products/${image.product_id}/images`);
  revalidatePath(`/admin/products`);

  return { success: true };
}

export async function setPrimaryImage(
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

  revalidatePath(`/admin/products/${productId}/images`);
  revalidatePath(`/admin/products`);

  return { success: true };
}

export async function updateImageMetadata(
  imageId: string,
  updates: { alt_text?: string; position?: number }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: image, error: fetchError } = await supabase
    .from('product_images')
    .select('product_id')
    .eq('id', imageId)
    .single();

  if (fetchError || !image) {
    return { success: false, error: 'Image not found' };
  }

  const { error } = await supabase
    .from('product_images')
    .update(updates)
    .eq('id', imageId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/products/${image.product_id}/images`);

  return { success: true };
}

export async function reorderImages(
  productId: string,
  imageIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const updates = imageIds.map((id, index) => 
    supabase
      .from('product_images')
      .update({ position: index })
      .eq('id', id)
      .eq('product_id', productId)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    return { success: false, error: 'Failed to reorder some images' };
  }

  revalidatePath(`/admin/products/${productId}/images`);

  return { success: true };
}

export async function migrateExternalImage(
  externalUrl: string,
  productId: string
): Promise<UploadResult> {
  try {
    const response = await fetch(externalUrl);
    
    if (!response.ok) {
      return { success: false, error: `Failed to fetch image: ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    if (!ALLOWED_TYPES.includes(contentType)) {
      return { success: false, error: `Invalid content type: ${contentType}` };
    }

    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return { success: false, error: 'External image too large' };
    }

    const supabase = await createClient();

    const extension = contentType.split('/')[1] || 'jpg';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const storagePath = `${productId}/${timestamp}-${randomSuffix}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return { success: true, storagePath, publicUrl };
  } catch (error) {
    return { 
      success: false, 
      error: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}
