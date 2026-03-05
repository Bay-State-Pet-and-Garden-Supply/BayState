import { createClient } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

export interface PersonalizedProduct extends Product {
  petName: string;
  petTypeName: string;
}

export interface ProductWithPetType extends Product {
  petTypeId: string;
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

  return (data || []).map((row: Record<string, unknown>) => ({
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

export async function getProductsForPetType(
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

  const products = (data || []).slice(0, limit).map((row: Record<string, unknown>) => ({
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

export async function getProductsForUserPets(
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
      .filter((p: Record<string, unknown>) => p.pet_type_id === pet.pet_type_id)
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

export async function getPetTypes(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('pet_types')
    .select('id, name')
    .order('display_order');

  if (error) {
    console.error('Error fetching pet types:', error);
    return [];
  }

  return data || [];
}

export async function getRelatedProductsByPetType(
  productId: string,
  limit = 4
): Promise<{ petTypeName: string; products: Product[] } | null> {
  const supabase = await createClient();

  const { data: productPetTypes } = await supabase
    .from('product_pet_types')
    .select('pet_type_id, pet_type:pet_types(id, name)')
    .eq('product_id', productId)
    .limit(1);

  if (!productPetTypes || productPetTypes.length === 0) {
    return null;
  }

  const petTypeData = productPetTypes[0].pet_type;
  if (!petTypeData || Array.isArray(petTypeData)) {
    return null;
  }
  const petType = petTypeData as { id: string; name: string };

  const { data: relatedData } = await supabase.rpc('get_products_for_pet_types', {
    pet_type_ids: [petType.id],
  });

  const relatedProducts = (relatedData || [])
    .filter((p: Record<string, unknown>) => p.id !== productId)
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
    }));

  if (relatedProducts.length === 0) {
    return null;
  }

  return {
    petTypeName: petType.name,
    products: relatedProducts,
  };
}
