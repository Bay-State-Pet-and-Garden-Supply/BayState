'use client';

import { useEffect, useCallback } from 'react';
import { X, User, Mail, Shield, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserProfile } from '@/lib/admin/users';
import Link from 'next/link';

interface CustomerModalProps {
    customer: UserProfile;
    onClose: () => void;
}

export function CustomerModal({
    customer,
    onClose,
}: CustomerModalProps) {

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
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                            <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold">{customer.full_name || 'Customer Profile'}</h2>
                            <p className="text-sm text-gray-600 font-mono">{customer.id}</p>
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
                    {/* Contact Info */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <Shield className="h-4 w-4" /> Account Details
                        </h3>
                        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Email</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <Mail className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm">{customer.email}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Joined</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <Calendar className="h-4 w-4 text-gray-600" />
                                    <span className="text-sm">{new Date(customer.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-xs font-medium text-gray-600 uppercase">Account Type</span>
                                <div className="mt-1">
                                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                                        Customer
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions / Stats */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" /> Actions
                        </h3>
                        <div className="rounded-lg border p-4 space-y-4">
                            <Button className="w-full" variant="outline" asChild>
                                {/* Assuming filtering by searching email works or will work */}
                                <Link href={`/admin/orders?q=${encodeURIComponent(customer.email || '')}`}>
                                    View Orders
                                </Link>
                            </Button>
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
