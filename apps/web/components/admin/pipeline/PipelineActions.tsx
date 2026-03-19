'use client';

import { Check, X, Trash2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PipelineActionsProps {
    selectedCount: number;
    selectedSkus: string[];
    currentStatus: string;
    onApprove: () => void;
    onReject: () => void;
    onDelete: () => void;
    onClear: () => void;
    loading?: {
        approve?: boolean;
        reject?: boolean;
        delete?: boolean;
    };
}

export function PipelineActions({
    selectedCount,
    onApprove,
    onReject,
    onDelete,
    onClear,
    loading = {},
}: PipelineActionsProps) {
    if (selectedCount === 0) {
        return null;
    }

    const { approve: isApproving = false, reject: isRejecting = false, delete: isDeleting = false } = loading;

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-card-foreground shadow-sm">
            <span className="text-sm font-medium">
                {selectedCount} product{selectedCount !== 1 ? 's' : ''} selected
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    onClick={onApprove}
                    disabled={isApproving}
                    className="gap-1.5"
                >
                    {isApproving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Check className="h-4 w-4" />
                    )}
                    {isApproving ? 'Approving…' : 'Approve'}
                </Button>

                <Button
                    size="sm"
                    variant="secondary"
                    onClick={onReject}
                    disabled={isRejecting}
                    className="gap-1.5"
                >
                    {isRejecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <XCircle className="h-4 w-4" />
                    )}
                    {isRejecting ? 'Rejecting…' : 'Reject'}
                </Button>

                <Button
                    size="sm"
                    variant="destructive"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="gap-1.5"
                >
                    {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Trash2 className="h-4 w-4" />
                    )}
                    {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>

                <div className="h-6 w-px bg-border mx-1" />

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClear}
                    disabled={isApproving || isRejecting || isDeleting}
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                    Clear
                </Button>
            </div>
        </div>
    );
}
