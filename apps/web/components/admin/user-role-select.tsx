'use client'

import { useState } from 'react'
import { updateRoleAction } from '@/lib/admin/actions'

export function UserRoleSelect({ userId, currentRole }: { userId: string, currentRole: string }) {
    const [loading, setLoading] = useState(false)

    async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const newRole = e.target.value
        if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
            setLoading(true)
            const res = await updateRoleAction(userId, newRole)
            setLoading(false)
            if (!res.success) {
                alert('Failed to update role: ' + res.error)
            }
        } else {
            // Revert select if cancelled? 
            // The value is controlled by props? No, usually native select assumes value changes.
            // But since parent revalidates, it should sync.
            // Forced refresh might be needed if cancelled.
            e.target.value = currentRole
        }
    }

    return (
        <select
            value={currentRole}
            onChange={handleChange}
            disabled={loading}
            className="border rounded p-1 text-sm bg-background"
        >
            <option value="customer">Customer</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
        </select>
    )
}
