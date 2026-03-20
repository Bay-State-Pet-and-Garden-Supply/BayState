'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline/types';
import { STAGE_CONFIG } from '@/lib/pipeline/types';

interface ProductCardProps {
  product: PipelineProduct;
  isSelected: boolean;
  onSelect: (sku: string, selected: boolean) => void;
}

export function ProductCard({
  product,
  isSelected,
  onSelect,
}: ProductCardProps) {
  const stageConfig = STAGE_CONFIG[product.pipeline_status];
  const displayName = product.consolidated?.name || product.input?.name || 'Unnamed Product';
  const displayPrice = product.consolidated?.price ?? product.input?.price;
  const sourceCount = product.sources ? Object.keys(product.sources).length : 0;

  const handleCheckboxChange = (checked: boolean) => {
    onSelect(product.sku, checked);
  };

  return (
    <Card
      className={`group relative overflow-hidden transition-all cursor-pointer ${
        isSelected ? 'border-[#008850] shadow-md ring-1 ring-[#008850]/20' : 'hover:shadow-md hover:border-primary/30'
      }`}
      onClick={() => onSelect(product.sku, !isSelected)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="pt-1" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              aria-label={`Select ${product.sku}`}
            />
          </div>

          <div className="flex-1 min-w-0">
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

            <h3 className="font-medium text-sm mb-1 truncate" title={displayName}>
              {displayName}
            </h3>

            <div className="flex items-center gap-3">
              {displayPrice !== undefined && (
                <p className="text-sm text-muted-foreground">
                  ${displayPrice.toFixed(2)}
                </p>
              )}
              {sourceCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            {product.error_message && (
              <p className="mt-1 text-xs text-red-500 truncate" title={product.error_message}>
                ⚠ {product.error_message}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
