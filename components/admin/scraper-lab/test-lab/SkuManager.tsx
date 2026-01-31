/**
 * SkuManager Component
 *
 * Manages test SKUs for scraper configurations with add/remove functionality,
 * type selection, validation, and persistence to scraper config via API.
 */

'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  CheckCircle2,
  Package,
  Sparkles,
  AlertOctagon,
  Layers,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Maximum number of SKUs allowed per test run */
const MAX_SKUS = 50;

/** Warning threshold for SKU count */
const WARNING_THRESHOLD = 45;

/** SKU type definitions with metadata */
const SKU_TYPES = {
  golden: {
    label: 'Golden',
    description: 'Should succeed and return valid data',
    icon: Sparkles,
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    iconClass: 'text-emerald-500',
  },
  fake: {
    label: 'Fake',
    description: 'Should return 404 or no results',
    icon: AlertOctagon,
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
    iconClass: 'text-rose-500',
  },
  edge: {
    label: 'Edge',
    description: 'Special cases and boundary conditions',
    icon: Layers,
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    iconClass: 'text-amber-500',
  },
} as const;

type SkuType = keyof typeof SKU_TYPES;

/** Individual SKU item */
interface SkuItem {
  sku: string;
  type: SkuType;
}

/** Props for the SkuManager component */
interface SkuManagerProps {
  /** Scraper configuration ID */
  scraperId: string;
  /** Initial SKUs grouped by type */
  initialSkus?: {
    test_skus?: string[];
    fake_skus?: string[];
    edge_case_skus?: string[];
  };
  /** Callback fired after successful save */
  onSave?: (skus: SkuItem[]) => void;
  /** Optional CSS class */
  className?: string;
}

/**
 * Converts initial SKU arrays into a unified SkuItem array
 */
function normalizeSkus(initialSkus?: SkuManagerProps['initialSkus']): SkuItem[] {
  const skus: SkuItem[] = [];

  (initialSkus?.test_skus || []).forEach((sku) => {
    skus.push({ sku, type: 'golden' });
  });

  (initialSkus?.fake_skus || []).forEach((sku) => {
    skus.push({ sku, type: 'fake' });
  });

  (initialSkus?.edge_case_skus || []).forEach((sku) => {
    skus.push({ sku, type: 'edge' });
  });

  return skus;
}

/**
 * Groups SKUs by type for API payload
 */
function groupSkusByType(skus: SkuItem[]) {
  return {
    test_skus: skus.filter((s) => s.type === 'golden').map((s) => s.sku),
    fake_skus: skus.filter((s) => s.type === 'fake').map((s) => s.sku),
    edge_case_skus: skus.filter((s) => s.type === 'edge').map((s) => s.sku),
  };
}

export function SkuManager({
  scraperId,
  initialSkus,
  onSave,
  className,
}: SkuManagerProps) {
  const [skus, setSkus] = useState<SkuItem[]>(() => normalizeSkus(initialSkus));
  const [newSku, setNewSku] = useState('');
  const [newSkuType, setNewSkuType] = useState<SkuType>('golden');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const skuCount = skus.length;
  const isAtLimit = skuCount >= MAX_SKUS;
  const isNearLimit = skuCount >= WARNING_THRESHOLD && skuCount < MAX_SKUS;
  const remainingSlots = MAX_SKUS - skuCount;

  /**
   * Refresh SKUs from API
   */
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setValidationError(null);

    try {
      const response = await fetch(`/api/admin/scraper-configs/${scraperId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch SKUs');
      }

      const data = await response.json();

      const loadedSkus: SkuItem[] = [];
      (data.config?.test_skus || []).forEach((sku: string) => {
        loadedSkus.push({ sku, type: 'golden' });
      });
      (data.config?.fake_skus || []).forEach((sku: string) => {
        loadedSkus.push({ sku, type: 'fake' });
      });
      (data.config?.edge_case_skus || []).forEach((sku: string) => {
        loadedSkus.push({ sku, type: 'edge' });
      });

      setSkus(loadedSkus);
      toast.success('SKUs loaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load SKUs';
      setValidationError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [scraperId]);

  /**
   * Validates and adds a new SKU to the list
   */
  const handleAddSku = useCallback(() => {
    const trimmedSku = newSku.trim();

    // Clear previous errors
    setValidationError(null);

    // Validation: non-empty
    if (!trimmedSku) {
      setValidationError('SKU cannot be empty');
      return;
    }

    // Validation: max limit
    if (skuCount >= MAX_SKUS) {
      setValidationError(`Maximum ${MAX_SKUS} SKUs allowed`);
      return;
    }

    // Validation: unique
    const exists = skus.some((s) => s.sku === trimmedSku);
    if (exists) {
      setValidationError(`SKU "${trimmedSku}" already exists`);
      return;
    }

    // Add the SKU
    setSkus((prev) => [...prev, { sku: trimmedSku, type: newSkuType }]);
    setNewSku('');
    toast.success(`Added ${trimmedSku} as ${SKU_TYPES[newSkuType].label}`);
  }, [newSku, newSkuType, skus, skuCount]);

  /**
   * Removes a SKU from the list
   */
  const handleRemoveSku = useCallback((skuToRemove: string) => {
    setSkus((prev) => prev.filter((s) => s.sku !== skuToRemove));
    setValidationError(null);
    toast.info(`Removed ${skuToRemove}`);
  }, []);

  /**
   * Handles Enter key in input field
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSku();
    }
  };

  /**
   * Persists SKUs to scraper config via API
   */
  const handleSave = useCallback(async () => {
    if (skuCount === 0) {
      toast.error('No SKUs to save');
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      const groupedSkus = groupSkusByType(skus);

      const response = await fetch(
        `/api/admin/scraper-configs/${scraperId}/draft`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: groupedSkus,
            change_summary: `Updated test SKUs: ${skuCount} total (${groupedSkus.test_skus.length} golden, ${groupedSkus.fake_skus.length} fake, ${groupedSkus.edge_case_skus.length} edge)`,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save SKUs');
      }

      toast.success(`Saved ${skuCount} SKUs to scraper config`);
      onSave?.(skus);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save SKUs';
      setValidationError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [scraperId, skus, skuCount, onSave]);

  /**
   * Renders a type badge with icon
   */
  const renderTypeBadge = (type: SkuType) => {
    const config = SKU_TYPES[type];
    const Icon = config.icon;

    return (
      <Badge
        variant="outline"
        className={`${config.badgeClass} font-medium flex items-center gap-1`}
      >
        <Icon className={`h-3 w-3 ${config.iconClass}`} />
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <Package className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Test SKU Manager</CardTitle>
          </div>
          <Badge
            variant={isAtLimit ? 'destructive' : isNearLimit ? 'default' : 'secondary'}
            className="font-mono"
          >
            {skuCount}/{MAX_SKUS} SKUs
          </Badge>
        </div>
        <CardDescription>
          Manage test SKUs for validation. Golden SKUs should succeed, fake SKUs
          should 404, edge cases test boundaries.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Limit Warnings */}
        {isAtLimit && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Maximum limit reached ({MAX_SKUS} SKUs). Remove SKUs to add more.
            </AlertDescription>
          </Alert>
        )}

        {isNearLimit && !isAtLimit && (
          <Alert className="py-2 border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Approaching limit: {remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} remaining
            </AlertDescription>
          </Alert>
        )}

        {/* Validation Error */}
        {validationError && (
          <Alert variant="destructive" className="py-2">
            <AlertOctagon className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {/* Add SKU Form */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Enter SKU..."
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAtLimit}
              className="font-mono"
            />
          </div>
          <Select
            value={newSkuType}
            onValueChange={(v) => setNewSkuType(v as SkuType)}
            disabled={isAtLimit}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SKU_TYPES).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.iconClass}`} />
                    {config.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAddSku}
            disabled={!newSku.trim() || isAtLimit}
            size="icon"
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* SKU Type Legend */}
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(SKU_TYPES).map(([key, config]) => (
            <div
              key={key}
              className="flex items-center gap-1 text-muted-foreground"
            >
              <config.icon className={`h-3 w-3 ${config.iconClass}`} />
              <span className="font-medium">{config.label}:</span>
              <span>{config.description}</span>
            </div>
          ))}
        </div>

        {/* SKU List */}
        <div className="space-y-2">
          {isLoading ? (
            // Loading skeleton
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              ))}
            </div>
          ) : skus.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 font-medium">
                No test SKUs configured
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Add SKUs above to get started with testing
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {skus.map((sku) => (
                <div
                  key={sku.sku}
                  className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm truncate">
                      {sku.sku}
                    </span>
                    {renderTypeBadge(sku.type)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSku(sku.sku)}
                    disabled={isSaving}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="pt-2 border-t flex gap-2">
          <Button
            onClick={handleSave}
            disabled={skus.length === 0 || isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save to Scraper Config
                {skuCount > 0 && (
                  <Badge variant="secondary" className="ml-2 font-mono">
                    {skuCount}
                  </Badge>
                )}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            size="icon"
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
