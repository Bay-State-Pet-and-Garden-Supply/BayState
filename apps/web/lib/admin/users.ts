import { createClient } from '@/lib/supabase/server'

export type UserProfile = {
    id: string
    full_name: string | null
    email: string | null
    role: 'admin' | 'staff' | 'customer'
    created_at: string
}

export async function getUsers({
    page = 1,
    limit = 10,
    search = '',
    role = 'all'
}: {
    page?: number
    limit?: number
    search?: string
    role?: string
} = {}) {
    const supabase = await createClient()
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })

    if (role && role !== 'all') {
        query = query.eq('role', role)
    }

    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data, error, count } = await query
        .range(from, to)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching users:', error)
        return { users: [], count: 0 }
    }

    return { users: data as UserProfile[], count: count ?? 0 }
}

export async function updateUserRole(userId: string, role: 'admin' | 'staff' | 'customer') {
    const supabase = await createClient()

    const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId)

    if (error) {
        console.error('Error updating role:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}
