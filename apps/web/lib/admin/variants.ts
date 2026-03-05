'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ProductVariant, ProductOption, ProductOptionValue } from '@/lib/types';

export interface VariantWithOptions extends ProductVariant {
  product?: {
    id: string;
    name: string;
  };
}

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching variants:', error);
    return [];
  }
  
  return data as ProductVariant[];
}

export async function getProductOptions(productId: string): Promise<ProductOption[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('product_options')
    .select(`
      *,
      values:product_option_values(*)
    `)
    .eq('product_id', productId)
    .order('position', { ascending: true });
  
  if (error) {
    console.error('Error fetching options:', error);
    return [];
  }
  
  return data as ProductOption[];
}

export async function createProductOption(
  productId: string,
  name: string
): Promise<{ success: boolean; option?: ProductOption; error?: string }> {
  const supabase = await createClient();
  
  const { data: existingOptions } = await supabase
    .from('product_options')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1);
  
  const nextPosition = existingOptions?.[0]?.position !== undefined 
    ? existingOptions[0].position + 1 
    : 0;
  
  const { data, error } = await supabase
    .from('product_options')
    .insert({ product_id: productId, name, position: nextPosition })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath(`/admin/products/${productId}`);
  return { success: true, option: data as ProductOption };
}

export async function updateProductOption(
  optionId: string,
  updates: Partial<Pick<ProductOption, 'name' | 'position'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_options')
    .update(updates)
    .eq('id', optionId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function deleteProductOption(
  optionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_options')
    .delete()
    .eq('id', optionId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function createOptionValue(
  optionId: string,
  value: string,
  colorHex?: string
): Promise<{ success: boolean; value?: ProductOptionValue; error?: string }> {
  const supabase = await createClient();
  
  const { data: existingValues } = await supabase
    .from('product_option_values')
    .select('position')
    .eq('option_id', optionId)
    .order('position', { ascending: false })
    .limit(1);
  
  const nextPosition = existingValues?.[0]?.position !== undefined 
    ? existingValues[0].position + 1 
    : 0;
  
  const { data, error } = await supabase
    .from('product_option_values')
    .insert({ 
      option_id: optionId, 
      value, 
      position: nextPosition,
      color_hex: colorHex || null
    })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true, value: data as ProductOptionValue };
}

export async function deleteOptionValue(
  valueId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_option_values')
    .delete()
    .eq('id', valueId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function createProductVariant(
  productId: string,
  variantData: {
    sku?: string;
    title?: string;
    price: number;
    compare_at_price?: number;
    quantity?: number;
    weight?: number;
    weight_unit?: string;
    option_values?: Array<{ option_id: string; value_id: string }>;
  }
): Promise<{ success: boolean; variant?: ProductVariant; error?: string }> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      sku: variantData.sku || null,
      title: variantData.title || null,
      price: variantData.price,
      compare_at_price: variantData.compare_at_price || null,
      quantity: variantData.quantity ?? 0,
      weight: variantData.weight || null,
      weight_unit: variantData.weight_unit || 'lb',
      option_values: variantData.option_values || [],
    })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath(`/admin/products/${productId}`);
  return { success: true, variant: data as ProductVariant };
}

export async function updateProductVariant(
  variantId: string,
  updates: Partial<Omit<ProductVariant, 'id' | 'product_id' | 'created_at'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_variants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', variantId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}

export async function deleteProductVariant(
  variantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_variants')
    .delete()
    .eq('id', variantId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/products');
  return { success: true };
}
