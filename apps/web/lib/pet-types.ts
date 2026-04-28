import { createClient } from '@/lib/supabase/server';
import { PetType } from '@/lib/types';

/**
 * Fetch all available pet types for the dropdown
 */
export async function getPetTypes(): Promise<PetType[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('pet_types')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Error fetching pet types:', error);
        return [];
    }

    return data as PetType[];
}
