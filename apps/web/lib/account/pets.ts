'use server'

import { createClient } from '@/lib/supabase/server';
import { Pet, PetType } from '@/lib/types';
import { revalidatePath } from 'next/cache';

/**
 * Fetch all available pet types for the dropdown
 */
export async function getPetTypes() {
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

/**
 * Fetch all pets for the current user
 */
export async function getUserPets() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('user_pets')
        .select(`
      *,
      pet_type:pet_types(*)
    `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching user pets:', error);
        return [];
    }

    return data as Pet[];
}

/**
 * Fetch a single pet by ID
 */
export async function getPetById(id: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('user_pets')
        .select(`
      *,
      pet_type:pet_types(*)
    `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching pet:', error);
        return null;
    }

    return data as Pet;
}

/**
 * Create a new pet profile
 */
export async function createPet(petData: Partial<Pet>) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
        .from('user_pets')
        .insert({
            ...petData,
            user_id: user.id
        });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/account/pets');
    return { success: true };
}

/**
 * Update an existing pet profile
 */
export async function updatePet(id: string, petData: Partial<Pet>) {
    const supabase = await createClient();

    // Remove nested object if present to avoid update error
    const { pet_type: _pet_type, ...updateData } = petData;

    const { error } = await supabase
        .from('user_pets')
        .update(updateData)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/account/pets');
    return { success: true };
}

/**
 * Delete a pet profile
 */
export async function deletePet(id: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('user_pets')
        .delete()
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath('/account/pets');
    return { success: true };
}
