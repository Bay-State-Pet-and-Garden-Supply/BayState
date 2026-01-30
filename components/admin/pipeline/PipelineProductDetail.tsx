'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, CheckCircle, Package } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface PipelineProductDetailProps {
  sku: string;
  onClose: () => void;
  onSave: () => void;
}

const stockStatusOptions = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'pre_order', label: 'Pre-Order' },
];

const pipelineStatusOptions: { value: PipelineStatus; label: string }[] = [
  { value: 'staging', label: 'Imported' },
  { value: 'scraped', label: 'Enhanced' },
  { value: 'consolidated', label: 'Ready for Review' },
  { value: 'approved', label: 'Verified' },
  { value: 'published', label: 'Live' },
];

export function PipelineProductDetail({
  sku,
  onClose,
  onSave,
}: PipelineProductDetailProps) {
  const [product, setProduct] = useState<PipelineProduct | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [brandId, setBrandId] = useState('none');
  const [stockStatus, setStockStatus] = useState('in_stock');
  const [isFeatured, setIsFeatured] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('staging');

  // Fetch product and brands
  useEffect(() => {
    async function fetchData() {
      try {
        const [productRes, brandsRes] = await Promise.all([
          fetch(`/api/admin/pipeline/${encodeURIComponent(sku)}`),
          fetch('/api/admin/brands'),
        ]);

        if (!productRes.ok) {
          throw new Error('Failed to fetch product');
        }

        const productData = await productRes.json();
        const brandsData = brandsRes.ok ? await brandsRes.json() : { brands: [] };

        setProduct(productData.product);
        setBrands(brandsData.brands || []);

        // Initialize form with consolidated data
        const consolidated = productData.product?.consolidated || {};
        const input = productData.product?.input || {};

        setName(consolidated.name || input.name || '');
        setDescription(consolidated.description || '');
        setPrice(String(consolidated.price ?? input.price ?? ''));
        setBrandId(consolidated.brand_id || 'none');
        setStockStatus(consolidated.stock_status || 'in_stock');
        setIsFeatured(consolidated.is_featured || false);
        setPipelineStatus(productData.product?.pipeline_status || 'staging');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [sku]);

  // Focus trap
  useEffect(() => {
    if (loading || !product) return;

    const modalElement = document.getElementById('product-detail-modal');
    if (!modalElement) return;

    // Find all focusable elements
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    // Focus the first element (usually close button or header action)
    // We use a small timeout to ensure rendering is complete
    setTimeout(() => {
        firstElement.focus();
    }, 50);

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, [loading, product]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSave = async (andApprove = false) => {
    setSaving(true);
    setError(null);

    try {
      const consolidated = {
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price) || 0,
        brand_id: brandId === 'none' ? null : brandId,
        stock_status: stockStatus,
        is_featured: isFeatured,
        images: product?.consolidated?.images || [],
      };

      const newStatus = andApprove ? 'approved' : pipelineStatus;

      const res = await fetch(`/api/admin/pipeline/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consolidated, pipeline_status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(andApprove ? 'Product saved and verified!' : 'Product saved successfully');
      onSave();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-white p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-white p-8">
          <p className="text-red-600">Product not found</p>
          <Button onClick={onClose} className="mt-4">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
        id="product-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-gray-600" />
            <div>
              <h2 id="modal-title" className="text-lg font-semibold">Edit Product</h2>
              <p className="text-sm text-gray-600 font-mono">{sku}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form Content */}
        <div className="p-6 space-y-6">
          {/* Pipeline Status */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50">
            <Label className="w-32">Product Stage</Label>
            <Select value={pipelineStatus} onValueChange={(v) => setPipelineStatus(v as PipelineStatus)}>
              <SelectTrigger className="w-48" aria-label="Product Stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pipelineStatusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Main Form Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price ($) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger aria-label="Brand">
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No brand</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stockStatus">Stock Status</Label>
                <Select value={stockStatus} onValueChange={setStockStatus}>
                  <SelectTrigger aria-label="Stock Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stockStatusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="featured"
                  checked={isFeatured}
                  onCheckedChange={(checked) => setIsFeatured(checked === true)}
                />
                <Label htmlFor="featured" className="cursor-pointer">
                  Featured Product
                </Label>
              </div>
            </div>

            {/* Right Column - Description */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter product description"
                  rows={8}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              {/* Images Preview */}
              {product.consolidated?.images && product.consolidated.images.length > 0 && (
                <div className="space-y-2">
                  <Label>Images</Label>
                  <div className="flex gap-2 flex-wrap">
                    {product.consolidated.images
                      .map((img) => img.trim())
                      .filter((img) => img.startsWith('/') || img.startsWith('http'))
                      .slice(0, 4)
                      .map((img, idx) => (
                        <div
                          key={idx}
                          className="h-16 w-16 rounded border bg-gray-100 overflow-hidden"
                        >
                          <img
                            src={img}
                            alt={`Product image ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    {product.consolidated.images.length > 4 && (
                      <div className="flex h-16 w-16 items-center justify-center rounded border bg-gray-50 text-sm text-gray-600">
                        +{product.consolidated.images.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Source Data (Read-only) */}
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium text-gray-700">
              Source Data (Read-only)
            </summary>
            <div className="mt-4 space-y-4">
              {/* Input Data */}
              <div>
                <h4 className="text-sm font-medium text-gray-600 mb-2">
                  Original Input (ShopSite)
                </h4>
                <pre className="rounded bg-gray-50 p-3 text-xs overflow-x-auto">
                  {JSON.stringify(product.input, null, 2)}
                </pre>
              </div>

              {/* Scraped Sources */}
              {Object.keys(product.sources || {}).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-600 mb-2">
                    Scraped Data
                  </h4>
                  <pre className="rounded bg-gray-50 p-3 text-xs overflow-x-auto">
                    {JSON.stringify(product.sources, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 flex items-center justify-between border-t bg-gray-50 px-6 py-4">
          <p className="text-xs text-gray-600">
            Press <kbd className="rounded bg-gray-200 px-1">Esc</kbd> to close,{' '}
            <kbd className="rounded bg-gray-200 px-1">Ctrl+S</kbd> to save
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            {pipelineStatus !== 'approved' && pipelineStatus !== 'published' && (
              <Button onClick={() => handleSave(true)} disabled={saving}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save & Verify'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
