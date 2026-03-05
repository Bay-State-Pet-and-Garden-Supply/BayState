'use server'

import { updateUserRole } from './users'
import { revalidatePath } from 'next/cache'

export async function updateRoleAction(userId: string, role: string) {
    // Validate role
    if (!['admin', 'staff', 'customer'].includes(role)) {
        return { success: false, error: 'Invalid role' }
    }

    const res = await updateUserRole(userId, role as 'admin' | 'staff' | 'customer')

    if (res.success) {
        revalidatePath('/admin/users')
    }

    return res
}
