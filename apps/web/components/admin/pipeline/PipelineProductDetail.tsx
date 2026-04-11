'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Save, CheckCircle, Package, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline/types';
import { SHOPSITE_PAGES } from '@/lib/shopsite/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageSelector } from './ImageSelector';
import { Badge } from '@/components/ui/badge';
import { AlertBanner } from '@/components/admin/pipeline/AlertBanner';

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

const pipelineStatusOptions: { value: PipelineStatus; label: string }[] = [
  { value: 'imported', label: 'Imported' },
  { value: 'scraped', label: 'Scraped' },
  { value: 'finalized', label: 'Finalized' },
  { value: 'published', label: 'Published' },
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
  const [weight, setWeight] = useState('');
  const [brandId, setBrandId] = useState('none');
  const [productOnPages, setProductOnPages] = useState<string[]>([]);

  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('imported');
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

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
        const candidates = Array.isArray(productData.product?.image_candidates)
          ? (productData.product.image_candidates as unknown[])
              .filter((entry): entry is string => typeof entry === 'string')
          : [];
        const currentImages = Array.isArray(consolidated.images)
          ? (consolidated.images as unknown[]).filter((entry): entry is string => typeof entry === 'string')
          : [];

        setName(consolidated.name || input.name || '');
        setDescription(consolidated.description || input.description || '');
        setPrice(String(consolidated.price ?? input.price ?? ''));
        setWeight(consolidated.weight || input.weight || '');
        setBrandId(consolidated.brand_id || 'none');
        
        // Handle pages (product_on_pages is the internal field name)
        let pages: string[] = [];
        if (Array.isArray(consolidated.product_on_pages)) {
            pages = consolidated.product_on_pages;
        } else if (Array.isArray(input.product_on_pages)) {
            pages = input.product_on_pages;
        } else if (typeof (consolidated.product_on_pages || input.product_on_pages) === 'string') {
            pages = (consolidated.product_on_pages || input.product_on_pages).split('|').map((p: string) => p.trim()).filter(Boolean);
        }
        setProductOnPages(pages);

        setPipelineStatus(productData.product?.pipeline_status || 'imported');
        setImageCandidates(candidates);
        setSelectedImages(currentImages);
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
        weight: weight.trim(),
        product_on_pages: productOnPages,
        images: selectedImages
          .map((img) => img.trim())
          .filter((img) => img.startsWith('/') || img.startsWith('http') || img.startsWith('data:image/')),
      };

      const newStatus = andApprove ? 'finalized' : pipelineStatus;

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
        <div className="rounded-lg bg-card p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-card p-8">
          <p className="text-red-600">Product not found</p>
          <Button onClick={onClose} className="mt-4">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const togglePage = (page: string) => {
    setProductOnPages(prev => 
      prev.includes(page) 
        ? prev.filter(p => p !== page) 
        : [...prev, page]
    );
  };

  return (
    <div 
        id="product-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-muted-foreground" />
            <div>
              <h2 id="modal-title" className="text-lg font-semibold">Edit Product</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono tabular-nums">
                <span className="bg-muted px-1.5 py-0.5 rounded">{sku}</span>
                <span>•</span>
                <span className="font-bold text-primary">${Number(price || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4">
            <AlertBanner
              severity="error"
              title="Error"
              message={error}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {/* Form Content */}
        <div className="p-6 space-y-8">
          {/* Stage */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
            <Label className="w-32 font-semibold">Product Stage</Label>
            <Select value={pipelineStatus} onValueChange={(v) => setPipelineStatus(v as PipelineStatus)}>
              <SelectTrigger className="w-full bg-background" aria-label="Product Stage">
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

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Left Column: Core Fields */}
            <div className="space-y-6">
              <div className="space-y-4 rounded-xl border bg-card p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Core Information</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Product Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter product name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weight" className="text-sm font-medium">Weight (lb)</Label>
                    <Input
                      id="weight"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand" className="text-sm font-medium">Brand</Label>
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
              </div>

              <div className="space-y-4 rounded-xl border bg-card p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">ShopSite Pages</h3>
                <div className="flex flex-wrap gap-2 p-3 rounded-md border bg-muted/30 min-h-[80px]">
                    {SHOPSITE_PAGES.map(page => (
                        <Badge
                            key={page}
                            variant={productOnPages.includes(page) ? "default" : "outline"}
                            className="cursor-pointer select-none transition-colors"
                            onClick={() => togglePage(page)}
                        >
                            {page}
                        </Badge>
                    ))}
                </div>
              </div>
            </div>

            {/* Right Column: Description & Images */}
            <div className="space-y-6">
              <div className="space-y-4 rounded-xl border bg-card p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Display Content</h3>
                <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-medium">Product Description</Label>
                    <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Storefront description"
                    rows={8}
                    />
                </div>
              </div>

              {imageCandidates.length > 0 && (
                <div className="space-y-4 rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Product Images</h3>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {selectedImages.length} selected
                    </span>
                  </div>
                  <ImageSelector
                    images={imageCandidates
                      .map((img) => img.trim())
                      .filter((img) => img.startsWith('/') || img.startsWith('http') || img.startsWith('data:image/'))}
                    onSave={(selected) => setSelectedImages(selected)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Source Data (Read-only) */}
          <details className="group rounded-xl border bg-muted/30 overflow-hidden">
            <summary className="cursor-pointer font-bold text-sm text-muted-foreground p-4 hover:bg-muted/50 transition-colors flex items-center gap-2">
              <Info className="h-4 w-4" />
              Technical Source Data (Read-only)
            </summary>
            <div className="p-4 border-t bg-background/50 space-y-4">
              {/* Input Data */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-tight">
                  Original ShopSite Input
                </h4>
                <pre className="rounded-lg bg-muted p-4 text-[11px] font-mono overflow-x-auto leading-relaxed border">
                  {JSON.stringify(product.input, null, 2)}
                </pre>
              </div>

              {/* Scraped Sources */}
              {Object.keys(product.sources || {}).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-tight">
                    Multi-Source Scraped Data
                  </h4>
                  <pre className="rounded-lg bg-muted p-4 text-[11px] font-mono overflow-x-auto leading-relaxed border">
                    {JSON.stringify(product.sources, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 flex items-center justify-between border-t bg-muted/80 backdrop-blur-sm px-6 py-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold hidden sm:block">
            Esc to close • Ctrl+S to save
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex-1 sm:flex-none"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            {pipelineStatus !== 'finalized' && pipelineStatus !== 'published' && (
              <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1 sm:flex-none">
                <CheckCircle className="mr-2 h-4 w-4" />
                {saving ? 'Saving…' : 'Save & Verify'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
