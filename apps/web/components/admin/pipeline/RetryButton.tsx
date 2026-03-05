'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { type PipelineProduct } from '@/lib/pipeline';

interface RetryButtonProps {
    product: PipelineProduct;
    onRetry?: () => void;
}

export function RetryButton({ product, onRetry }: RetryButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [retryReason, setRetryReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleRetry = async () => {
        setError(null);
        setSuccess(false);

        startTransition(async () => {
            try {
                const response = await fetch('/api/admin/pipeline/retry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sku: product.sku,
                        retryReason: retryReason || 'Manual retry requested',
                    }),
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    setError(data.error || 'Failed to submit retry request');
                    return;
                }

                setSuccess(true);
                setTimeout(() => {
                    setIsOpen(false);
                    setSuccess(false);
                    setRetryReason('');
                    onRetry?.();
                }, 1500);
            } catch (err) {
                setError('An unexpected error occurred');
                console.error('[Retry] Error:', err);
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Retry Product Processing</DialogTitle>
                    <DialogDescription>
                        Request a retry for {product.sku}. This will re-queue the product
                        for scraping and consolidation.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {product.pipeline_status === 'failed' ? (
                        <div className="flex items-start gap-2 text-amber-600 bg-amber-50 p-3 rounded-md">
                            <AlertCircle className="h-5 w-5 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium">Previous attempt failed</p>
                                <p className="text-amber-700 mt-1">
                                    {product.error_message || 'No error details available'}
                                </p>
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for retry (optional)
                        </label>
                        <textarea
                            className="w-full p-2 border rounded-md text-sm"
                            rows={3}
                            placeholder="Describe why this product needs to be retried..."
                            value={retryReason}
                            onChange={(e) => setRetryReason(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="mt-4 text-red-600 text-sm bg-red-50 p-3 rounded-md">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mt-4 text-green-600 text-sm bg-green-50 p-3 rounded-md flex items-center gap-2">
                            <CheckCircle className="h-5 w-5" />
                            Retry request submitted successfully!
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setIsOpen(false)}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRetry}
                        disabled={isPending || success}
                    >
                        {isPending ? (
                            <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            'Submit Retry Request'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
