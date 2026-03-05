import { createClient } from '@/lib/supabase/server';

export type UserRole = 'admin' | 'staff' | 'customer';

export interface Profile {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: UserRole;
    created_at: string;
    updated_at: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as Profile;
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
    const profile = await getProfile(userId);
    return profile ? profile.role : null;
}

export async function hasRole(userId: string, role: UserRole): Promise<boolean> {
    const userRole = await getUserRole(userId);
    return userRole === role;
}
