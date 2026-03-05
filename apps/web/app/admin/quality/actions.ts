'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface ActionResult {
  success: boolean;
  error?: string;
  affectedCount?: number;
}

export async function titleCaseProductName(sku: string): Promise<ActionResult> {
  const supabase = await createClient();
  
  const { data: product, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('consolidated, input')
    .eq('sku', sku)
    .single();
  
  if (fetchError || !product) {
    return { success: false, error: 'Product not found' };
  }
  
  const currentName = product.consolidated?.name || product.input?.name || '';
  
  if (!currentName) {
    return { success: false, error: 'No name to convert' };
  }
  
  const titleCased = currentName
    .toLowerCase()
    .split(' ')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  const consolidated = { ...product.consolidated, name: titleCased };
  
  const { error: updateError } = await supabase
    .from('products_ingestion')
    .update({ consolidated, updated_at: new Date().toISOString() })
    .eq('sku', sku);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  revalidatePath('/admin/quality');
  return { success: true };
}

export async function bulkTitleCaseNames(): Promise<ActionResult> {
  const supabase = await createClient();
  
  const { data: products, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('sku, consolidated, input');
  
  if (fetchError) {
    return { success: false, error: fetchError.message };
  }
  
  const productsToFix = (products || []).filter(p => {
    const name = p.consolidated?.name || p.input?.name;
    return name && name === name.toUpperCase();
  });
  
  if (productsToFix.length === 0) {
    return { success: true, affectedCount: 0 };
  }
  
  let fixedCount = 0;
  
  for (const product of productsToFix) {
    const currentName = product.consolidated?.name || product.input?.name || '';
    const titleCased = currentName
      .toLowerCase()
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    const consolidated = { ...product.consolidated, name: titleCased };
    
    const { error } = await supabase
      .from('products_ingestion')
      .update({ consolidated, updated_at: new Date().toISOString() })
      .eq('sku', product.sku);
    
    if (!error) {
      fixedCount++;
    }
  }
  
  revalidatePath('/admin/quality');
  return { success: true, affectedCount: fixedCount };
}

export async function assignDefaultBrand(sku: string, brandId: string): Promise<ActionResult> {
  const supabase = await createClient();
  
  const { data: product, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('consolidated')
    .eq('sku', sku)
    .single();
  
  if (fetchError || !product) {
    return { success: false, error: 'Product not found' };
  }
  
  const consolidated = { ...product.consolidated, brand_id: brandId };
  
  const { error: updateError } = await supabase
    .from('products_ingestion')
    .update({ consolidated, updated_at: new Date().toISOString() })
    .eq('sku', sku);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  revalidatePath('/admin/quality');
  return { success: true };
}

export async function updateConsolidatedField(
  sku: string,
  field: string,
  value: unknown
): Promise<ActionResult> {
  const supabase = await createClient();
  
  const { data: product, error: fetchError } = await supabase
    .from('products_ingestion')
    .select('consolidated')
    .eq('sku', sku)
    .single();
  
  if (fetchError || !product) {
    return { success: false, error: 'Product not found' };
  }
  
  const consolidated = { ...product.consolidated, [field]: value };
  
  const { error: updateError } = await supabase
    .from('products_ingestion')
    .update({ consolidated, updated_at: new Date().toISOString() })
    .eq('sku', sku);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  revalidatePath('/admin/quality');
  return { success: true };
}
