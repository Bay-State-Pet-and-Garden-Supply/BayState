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
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isDeleting: boolean;
    sku?: string;
    productCount?: number;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
    isOpen,
    onOpenChange,
    onConfirm,
    isDeleting,
    sku,
    productCount,
}) => {
    const handleConfirm = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
    };

    const isBulk = Boolean(productCount && productCount > 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="h-5 w-5" />
                        {isBulk ? 'Confirm Bulk Deletion' : 'Confirm Deletion'}
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                        {isBulk ? (
                            <>
                                Are you sure you want to delete <span className="font-bold text-gray-900">{productCount}</span> selected products?
                            </>
                        ) : (
                            <>
                                Are you sure you want to delete SKU <span className="font-mono font-bold tabular-nums text-gray-900">{sku}</span>?
                            </>
                        )}
                        <br />
                        This action cannot be undone and will remove the product{isBulk ? 's' : ''} from all pipeline stages.
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-red-50 p-4 rounded-lg border border-red-100 my-4">
                    <p className="text-sm text-red-800">
                        <strong>Warning:</strong> Deleting {isBulk ? 'these products' : 'this product'} will remove {isBulk ? 'them' : 'it'} from the system entirely.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
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
                                Deleting…
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4" />
                                Delete {isBulk ? 'All' : 'Permanently'}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
