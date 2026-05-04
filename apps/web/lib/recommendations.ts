import { createClient, createPublicClient } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';
import { getPetTypes } from './pet-types';

interface PersonalizedProduct extends Product {
  petName: string;
  petTypeName: string;
}

interface ProductWithPetType extends Product {
  petTypeId: string;
}

function isStorefrontVisibleProduct(row: Record<string, unknown>): boolean {
  return row.stock_status === 'in_stock' || row.stock_status === 'pre_order';
}

export async function getPersonalizedProducts(
  userId: string,
  limit = 12
): Promise<PersonalizedProduct[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_personalized_products', {
    user_uuid: userId,
    result_limit: limit,
  });

  if (error) {
    console.error('Error fetching personalized products:', error);
    return [];
  }

  return (data || [])
    .filter(isStorefrontVisibleProduct)
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      brand_id: row.brand_id as string | null,
      name: row.name as string,
      slug: row.slug as string,
      description: null,
      price: row.price as number,
      stock_status: row.stock_status as 'in_stock' | 'out_of_stock' | 'pre_order',
      images: row.images as string[],
      is_featured: false,
      created_at: '',
      petName: row.pet_name as string,
      petTypeName: row.pet_type_name as string,
    }));
}

async function getProductsForPetType(
  petTypeId: string,
  limit = 24
): Promise<ProductWithPetType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_products_for_pet_types', {
    pet_type_ids: [petTypeId],
  });

  if (error) {
    console.error('Error fetching products for pet type:', error);
    return [];
  }

  const products = (data || [])
    .filter(isStorefrontVisibleProduct)
    .slice(0, limit)
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      brand_id: row.brand_id as string | null,
      name: row.name as string,
      slug: row.slug as string,
      description: null,
      price: row.price as number,
      stock_status: row.stock_status as 'in_stock' | 'out_of_stock' | 'pre_order',
      images: row.images as string[],
      is_featured: false,
      created_at: '',
      petTypeId: row.pet_type_id as string,
    }));

  return products;
}

async function getProductsForUserPets(
  userId: string
): Promise<Map<string, Product[]>> {
  const supabase = await createClient();

  const { data: userPets } = await supabase
    .from('user_pets')
    .select('id, name, pet_type_id, pet_type:pet_types(name)')
    .eq('user_id', userId);

  if (!userPets || userPets.length === 0) {
    return new Map();
  }

  const petTypeIds = [...new Set(userPets.map((p) => p.pet_type_id))];

  const { data: products } = await supabase.rpc('get_products_for_pet_types', {
    pet_type_ids: petTypeIds,
  });

  const productsByPetType = new Map<string, Product[]>();

  for (const pet of userPets) {
    const petProducts = (products || [])
      .filter(
        (p: Record<string, unknown>) =>
          p.pet_type_id === pet.pet_type_id && isStorefrontVisibleProduct(p)
      )
      .slice(0, 8)
      .map((row: Record<string, unknown>) => ({
        id: row.id as string,
        brand_id: row.brand_id as string | null,
        name: row.name as string,
        slug: row.slug as string,
        description: null,
        price: row.price as number,
        stock_status: row.stock_status as 'in_stock' | 'out_of_stock' | 'pre_order',
        images: row.images as string[],
        is_featured: false,
        created_at: '',
      }));

    productsByPetType.set(pet.name, petProducts);
  }

  return productsByPetType;
}
