'use client';

import { useEffect, useCallback } from 'react';
import { X, User, Mail, Shield, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserRoleSelect } from '@/components/admin/user-role-select';
import { UserProfile } from '@/lib/admin/users';

interface UserModalProps {
    user: UserProfile; // Viewing a specific user
    onClose: () => void;
    // No onSave needed primarily as editing is limited to role which saves instantly
}

export function UserModal({
    user,
    onClose,
}: UserModalProps) {

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
                    <div className="flex items-center gap-3">
                        <User className="h-6 w-6 text-blue-600" />
                        <div>
                            <h2 className="text-lg font-semibold">{user.full_name || 'User Profile'}</h2>
                            <p className="text-sm text-gray-600 font-mono">{user.id}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full p-2 hover:bg-gray-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="grid gap-6 p-6 md:grid-cols-2">
                    {/* Profile Info */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Shield className="h-4 w-4" /> Account Details
                        </h3>
                        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Email</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <Mail className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm">{user.email}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Joined</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <Calendar className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm">{new Date(user.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Role</span>
                                <div className="mt-1">
                                    <UserRoleSelect userId={user.id} currentRole={user.role} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats / History */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" /> Activity
                        </h3>
                        <div className="rounded-lg border border-dashed p-8 text-center">
                            <p className="text-sm text-gray-600">Order history and activity stats coming soon.</p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="sticky bottom-0 flex items-center justify-end border-t bg-gray-50 px-6 py-4">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
