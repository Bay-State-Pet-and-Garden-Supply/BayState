'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import type { SelectedImage, PipelineProduct } from '@/lib/pipeline';

interface ImageSelectionWorkspaceProps {
  /** Single SKU for image selection */
  sku: string;
  /** Callback when workspace is closed */
  onClose: () => void;
  /** Callback when images are saved (optional) */
  onSave?: () => void;
  /** Callback when product is finalized (optional) */
  onFinalize?: () => void;
}

const MAX_IMAGES = 10;

export function ImageSelectionWorkspace({
  sku,
  onClose,
  onSave,
  onFinalize,
}: ImageSelectionWorkspaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [product, setProduct] = useState<PipelineProduct | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pipeline/${sku}`);
      if (!res.ok) {
        throw new Error('Failed to fetch product');
      }
      const data = await res.json();
      setProduct(data.product);
      // Initialize selected URLs from existing selected_images
      const existingSelected = (data.product?.selected_images as SelectedImage[] | undefined)?.map((img: SelectedImage) => img.url) || [];
      setSelectedUrls(existingSelected);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Failed to load product');
    } finally {
      setIsLoading(false);
    }
  }, [sku]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const toggleImage = (imageUrl: string) => {
    setSelectedUrls((prev) => {
      if (prev.includes(imageUrl)) {
        return prev.filter((url) => url !== imageUrl);
      }
      // Enforce max 10 images
      if (prev.length >= MAX_IMAGES) {
        toast.warning(`Maximum ${MAX_IMAGES} images allowed`);
        return prev;
      }
      return [...prev, imageUrl];
    });
  };

  const handleSaveSelections = async () => {
    if (selectedUrls.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/pipeline/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, selectedImages: selectedUrls }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save images');
      }

      toast.success('Images saved successfully');
      onSave?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsFinalized = async () => {
    if (selectedUrls.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    setIsFinalizing(true);
    try {
      // First save the selections
      const saveRes = await fetch('/api/admin/pipeline/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, selectedImages: selectedUrls }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        throw new Error(data.error || 'Failed to save images');
      }

      // Then transition to finalized
      const transitionRes = await fetch('/api/admin/pipeline/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          fromStatus: 'enriched',
          toStatus: 'finalized',
        }),
      });

      if (!transitionRes.ok) {
        const data = await transitionRes.json();
        throw new Error(data.error || 'Failed to transition status');
      }

      toast.success('Product finalized successfully');
      onFinalize?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to finalize';
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-8 flex items-center gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading product images…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full p-6">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <ImageOff className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Error Loading Product</h3>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const imageCandidates = product?.image_candidates || [];
  const productName = product?.consolidated?.name || product?.input?.name || sku;
  const hasImages = imageCandidates.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">Image Selection</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select images for <span className="font-mono font-medium tabular-nums">{productName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {!hasImages ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageOff className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No Image Candidates</h3>
              <p className="text-sm text-muted-foreground mt-1">
                This product has no image candidates available for selection.
              </p>
            </div>
          ) : (
            <>
              {/* Selection Counter */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedUrls.length}</span>
                  {' of '}
                  <span className="font-medium">{MAX_IMAGES}</span>
                  {' images selected'}
                </p>
                {selectedUrls.length >= MAX_IMAGES && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    Maximum selection reached
                  </p>
                )}
              </div>

              {/* Image Grid - 4 cols desktop, 2 cols mobile */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {imageCandidates.map((imageUrl, index) => {
                  const isSelected = selectedUrls.includes(imageUrl);
                  const isDisabled = !isSelected && selectedUrls.length >= MAX_IMAGES;

                  return (
                    <div
                      key={imageUrl}
                      onClick={() => !isDisabled && toggleImage(imageUrl)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
                          e.preventDefault();
                          toggleImage(imageUrl);
                        }
                      }}
                      tabIndex={isDisabled ? -1 : 0}
                      role="button"
                      aria-pressed={isSelected}
                      aria-label={`Select image ${index + 1}`}
                      className={`
                        relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
                        ${isSelected
                          ? 'border-primary ring-2 ring-primary/20'
                          : isDisabled
                            ? 'border-border opacity-50 cursor-not-allowed'
                            : 'border-border hover:border-border'
                        }
                      `}
                    >
                      <img
                        src={imageUrl}
                        alt={`Product image ${index + 1}`}
                        className="w-full h-32 md:h-40 object-cover"
                        loading="lazy"
                      />
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 bg-primary/10" />
                          <div className="absolute top-2 right-2 rounded-full bg-primary p-1">
                            <CheckCircle2 className="h-4 w-4 text-white" />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/50">
          <p className="text-xs text-muted-foreground">
            Select up to {MAX_IMAGES} images for this product.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSelections}
              disabled={isSaving || selectedUrls.length === 0}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Selections
            </button>
            <button
              onClick={handleMarkAsFinalized}
              disabled={isFinalizing || selectedUrls.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isFinalizing && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark as Finalized
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
