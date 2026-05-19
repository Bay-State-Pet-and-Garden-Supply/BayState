import { createPublicClient } from '@/lib/supabase/server';

interface ProductPetType {
  id: string;
  name: string;
  icon: string | null;
}

export async function getProductPetTypes(productId: string): Promise<ProductPetType[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('product_pet_types')
    .select('pet_types(id, name, icon)')
    .eq('product_id', productId);

  if (error || !data) {
    if (error) {
      console.error('Error fetching product pet types:', error);
    }
    return [];
  }

  const petTypes: ProductPetType[] = [];

  for (const row of data) {
    const petType = Array.isArray(row.pet_types)
      ? row.pet_types[0]
      : (row.pet_types as unknown as { id: string; name: string; icon: string | null } | null);

    if (petType) {
      petTypes.push({
        id: petType.id,
        name: petType.name,
        icon: petType.icon,
      });
    }
  }

  return petTypes;
}
