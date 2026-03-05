'use client';

import { useEffect, useCallback } from 'react';
import { User, Mail, Shield, Calendar, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserProfile } from '@/lib/admin/users';
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

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
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                            <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <DialogTitle>{customer.full_name || 'Customer Profile'}</DialogTitle>
                            <p className="text-sm text-gray-600 font-mono">{customer.id}</p>
                        </div>
                    </div>
                </DialogHeader>

                {/* Content */}
                <div className="grid gap-6 py-4 md:grid-cols-2">
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
                                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-none">
                                        Customer
                                    </Badge>
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
                                {/* Assuming filtering by searching email works or will work */ }
                                <Link href={`/admin/orders?q=${encodeURIComponent(customer.email || '')}`}>
                                    View Orders
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
