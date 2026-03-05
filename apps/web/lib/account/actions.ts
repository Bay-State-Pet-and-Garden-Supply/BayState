'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'

const profileSchema = z.object({
    fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
    phone: z.string().optional(),
})

export async function updateProfileAction(values: z.infer<typeof profileSchema>) {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { error: 'Unauthorized' }
    }

    // Validate input (redundant if using Zod resolver on client, but good practice)
    const result = profileSchema.safeParse(values)
    if (!result.success) {
        return { error: 'Invalid data' }
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: values.fullName,
            phone: values.phone,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/account')
    revalidatePath('/account/profile')
    return { success: true }
}

/**
 * Creates a missing profile for the current user.
 * This handles legacy users who were created before the profile trigger was added.
 * Should only be called when a user explicitly requests to create their profile.
 */
export async function createMissingProfileAction() {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { error: 'Unauthorized' }
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

    if (existingProfile) {
        // Profile already exists, nothing to do
        return { success: true, message: 'Profile already exists' }
    }

    // Create the missing profile
    const { error } = await supabase
        .from('profiles')
        .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
            email: user.email,
            role: 'customer'
        })

    if (error) {
        console.error('Error creating missing profile:', error)
        return { error: 'Failed to create profile. Please try again.' }
    }

    revalidatePath('/account')
    revalidatePath('/account/profile')
    return { success: true }
}

const addressSchema = z.object({
    fullName: z.string().min(2, "Full Name is required"),
    addressLine1: z.string().min(5, "Address Line 1 is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    zipCode: z.string().min(5, "Zip Code is required"),
    phone: z.string().optional(),
    isDefault: z.boolean().default(false),
})

export async function addAddressAction(values: z.infer<typeof addressSchema>) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const validated = addressSchema.safeParse(values)
    if (!validated.success) return { error: 'Invalid data' }

    const { error } = await supabase.from('addresses').insert({
        user_id: user.id,
        full_name: values.fullName,
        address_line1: values.addressLine1,
        address_line2: values.addressLine2,
        city: values.city,
        state: values.state,
        zip_code: values.zipCode,
        phone: values.phone,
        is_default: values.isDefault,
    })

    if (error) return { error: error.message }
    revalidatePath('/account/addresses')
    return { success: true }
}

export async function deleteAddressAction(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase.from('addresses').delete().eq('id', id).eq('user_id', user.id)

    if (error) return { error: error.message }
    revalidatePath('/account/addresses')
    return { success: true }
}

export async function setDefaultAddressAction(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Update target to default. Trigger handles removing other defaults.
    const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', user.id)

    if (error) return { error: error.message }
    revalidatePath('/account/addresses')
    return { success: true }
}

export async function toggleWishlistAction(productId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: existingList } = await supabase
        .from('wishlists')
        .select('product_id')
        .eq('user_id', user.id)
        .eq('product_id', productId)

    const exists = existingList && existingList.length > 0

    if (exists) {
        const { error } = await supabase.from('wishlists').delete().eq('user_id', user.id).eq('product_id', productId)
        if (error) return { error: error.message }
        revalidatePath('/account/wishlist')
        return { success: true, action: 'removed' }
    } else {
        const { error } = await supabase.from('wishlists').insert({ user_id: user.id, product_id: productId })
        if (error) return { error: error.message }
        revalidatePath('/account/wishlist')
        return { success: true, action: 'added' }
    }
}
