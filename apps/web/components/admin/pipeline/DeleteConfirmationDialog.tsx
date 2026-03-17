import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    sku: string;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isDeleting,
    sku,
}) => {
    const handleConfirm = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                        Confirm Deletion
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                        Are you sure you want to delete SKU <span className="font-mono font-bold tabular-nums text-gray-900">{sku}</span>? 
                        This action cannot be undone and will remove the product from all pipeline stages.
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-red-50 p-4 rounded-lg border border-red-100 my-4">
                    <p className="text-sm text-red-800">
                        <strong>Warning:</strong> Deleting this product will remove it from the system entirely.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onClose}
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
                                Deleting…
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
};
