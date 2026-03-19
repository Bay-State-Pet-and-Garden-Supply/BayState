'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline/types';
import { STAGE_CONFIG } from '@/lib/pipeline/types';

interface ProductCardProps {
  product: PipelineProduct;
  isSelected: boolean;
  onSelect: (sku: string, selected: boolean) => void;
  onAction: (sku: string, action: PipelineStatus) => void;
  onView: (sku: string) => void;
}

const STAGE_ACTIONS: Record<PipelineStatus, { label: string; nextStatus: PipelineStatus | null }> = {
  imported: { label: 'Scrape', nextStatus: 'scraped' },
  scraped: { label: 'Consolidate', nextStatus: 'consolidated' },
  consolidated: { label: 'Finalize', nextStatus: 'finalized' },
  finalized: { label: 'Publish', nextStatus: 'published' },
  published: { label: '', nextStatus: null },
};

export function ProductCard({
  product,
  isSelected,
  onSelect,
  onAction,
  onView,
}: ProductCardProps) {
  const stageConfig = STAGE_CONFIG[product.pipeline_status];
  const actionConfig = STAGE_ACTIONS[product.pipeline_status];

  // Get display name: prefer consolidated name, fallback to input name
  const displayName = product.consolidated.name || product.input.name || 'Unnamed Product';
  
  // Get display price: prefer consolidated price, fallback to input price
  const displayPrice = product.consolidated.price ?? product.input.price;

  const handleCheckboxChange = (checked: boolean) => {
    onSelect(product.sku, checked);
  };

  const handleActionClick = () => {
    if (actionConfig.nextStatus) {
      onAction(product.sku, actionConfig.nextStatus);
    }
  };

  const handleCardClick = () => {
    onView(product.sku);
  };

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:border-primary/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Selection Checkbox */}
          <div className="pt-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              aria-label={`Select ${product.sku}`}
            />
          </div>

          {/* Product Info */}
          <div 
            className="flex-1 min-w-0 cursor-pointer"
            onClick={handleCardClick}
          >
            {/* Header: SKU and Status Badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-muted-foreground">
                {product.sku}
              </span>
              <Badge
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: stageConfig.color,
                  backgroundColor: `${stageConfig.color}15`,
                  color: stageConfig.color,
                }}
              >
                {stageConfig.label}
              </Badge>
            </div>

            {/* Product Name */}
            <h3 className="font-medium text-sm mb-1 truncate" title={displayName}>
              {displayName}
            </h3>

            {/* Price */}
            {displayPrice !== undefined && (
              <p className="text-sm text-muted-foreground">
                ${displayPrice.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        {actionConfig.nextStatus && (
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleActionClick}
            >
              {actionConfig.label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}