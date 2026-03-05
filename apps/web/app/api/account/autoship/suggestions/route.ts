import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userPets } = await supabase
    .from('user_pets')
    .select('pet_type_id, pet_type:pet_types(name)')
    .eq('user_id', user.id);

  if (!userPets || userPets.length === 0) {
    return NextResponse.json({ products: [] });
  }

  const petTypeIds = [...new Set(userPets.map((p) => p.pet_type_id))];

  const { data: productsData } = await supabase.rpc('get_products_for_pet_types', {
    pet_type_ids: petTypeIds,
  });

  if (!productsData) {
    return NextResponse.json({ products: [] });
  }

  const petTypeMap = new Map<string, string>();
  for (const pet of userPets) {
    const petTypeData = pet.pet_type;
    if (petTypeData && !Array.isArray(petTypeData)) {
      petTypeMap.set(pet.pet_type_id, (petTypeData as { name: string }).name);
    }
  }

  const products = productsData.slice(0, 12).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    images: row.images || [],
    petTypeName: petTypeMap.get(row.pet_type_id as string) || null,
  }));

  return NextResponse.json({ products });
}
