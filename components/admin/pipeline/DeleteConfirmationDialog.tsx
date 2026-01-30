'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteConfirmationDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    productCount: number;
    onConfirm: () => Promise<void>;
    isDeleting?: boolean;
}

export function DeleteConfirmationDialog({
    isOpen,
    onOpenChange,
    productCount,
    onConfirm,
    isDeleting = false,
}: DeleteConfirmationDialogProps) {
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        try {
            setError(null);
            await onConfirm();
            onOpenChange(false);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to delete products';
            setError(errorMessage);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <Trash2 className="h-5 w-5" />
                        Permanently Delete Products
                    </DialogTitle>
                    <DialogDescription>
                        This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <p className="font-semibold text-base">
                            Delete {productCount} product{productCount > 1 ? 's' : ''}?
                        </p>
                        <p className="text-sm text-gray-600">
                            Once deleted, these products will be permanently removed from the database and cannot be recovered.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={isDeleting}
                        className="gap-2"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4" />
                                Delete Permanently
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
