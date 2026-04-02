'use client'

import { useState } from 'react'
import { updateRoleAction } from '@/lib/admin/actions'
import { ConfirmationDialog } from '@/components/admin/confirmation-dialog'

export function UserRoleSelect({ userId, currentRole }: { userId: string, currentRole: string }) {
    const [loading, setLoading] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [pendingRole, setPendingRole] = useState<string | null>(null)

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const newRole = e.target.value
        setPendingRole(newRole)
        setConfirmOpen(true)
        e.target.value = currentRole
    }

    async function handleConfirmRoleChange() {
        if (!pendingRole) return
        setConfirmOpen(false)

        setLoading(true)
        const res = await updateRoleAction(userId, pendingRole)
        setLoading(false)
        if (!res.success) {
            alert('Failed to update role: ' + res.error)
        }

        setPendingRole(null)
    }

    return (
        <>
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

            <ConfirmationDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open)
                    if (!open) setPendingRole(null)
                }}
                onConfirm={handleConfirmRoleChange}
                title="Change User Role"
                description={`Are you sure you want to change this user's role to ${pendingRole}?`}
                confirmLabel="Change Role"
            />
        </>
    )
}
