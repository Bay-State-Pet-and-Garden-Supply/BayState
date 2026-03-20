'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline/types';
import { STAGE_CONFIG } from '@/lib/pipeline/types';

const DEFAULT_STAGE_CONFIG = {
    label: 'Unknown',
    color: '#6B7280',
    description: 'Unknown pipeline stage',
};

interface ProductTableProps {
    products: PipelineProduct[];
    selectedSkus: Set<string>;
    onSelectSku: (sku: string, selected: boolean) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    currentStage: PipelineStatus;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getSourceCount(sources: Record<string, unknown> | null | undefined): number {
    if (!sources || typeof sources !== 'object') return 0;
    return Object.keys(sources).length;
}

export function ProductTable({
    products,
    selectedSkus,
    onSelectSku,
    onSelectAll,
    onDeselectAll,
    currentStage,
}: ProductTableProps) {
    const allSelected = products.length > 0 && products.every((p) => selectedSkus.has(p.sku));
    const someSelected = products.some((p) => selectedSkus.has(p.sku)) && !allSelected;

    const handleHeaderCheckbox = () => {
        if (allSelected || someSelected) {
            onDeselectAll();
        } else {
            onSelectAll();
        }
    };

    const showSources = currentStage === 'scraped' || currentStage === 'consolidated';
    const showConfidence = currentStage === 'consolidated' || currentStage === 'finalized';

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/30">
                        <TableHead className="w-10">
                            <Checkbox
                                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                                onCheckedChange={handleHeaderCheckbox}
                                aria-label="Select all products"
                            />
                        </TableHead>
                        <TableHead className="w-36">SKU</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-24 text-right">Price</TableHead>
                        {showSources && (
                            <TableHead className="w-28 text-center">Sources</TableHead>
                        )}
                        {showConfidence && (
                            <TableHead className="w-28 text-center">Confidence</TableHead>
                        )}
                        <TableHead className="w-24 text-center">Status</TableHead>
                        <TableHead className="w-36">Updated</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product) => {
                        const isSelected = selectedSkus.has(product.sku);
                        const displayName = product.consolidated?.name || product.input?.name || '—';
                        const displayPrice = product.consolidated?.price ?? product.input?.price;
                        const stageConfig = STAGE_CONFIG[product.pipeline_status] ?? DEFAULT_STAGE_CONFIG;
                        const sourceCount = getSourceCount(product.sources);
                        const confidence = product.confidence_score;

                        return (
                            <TableRow
                                key={product.sku}
                                className={`cursor-pointer transition-colors ${isSelected ? 'bg-[#008850]/5' : 'hover:bg-muted/30'}`}
                                onClick={() => onSelectSku(product.sku, !isSelected)}
                            >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => onSelectSku(product.sku, !!checked)}
                                        aria-label={`Select ${product.sku}`}
                                    />
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {product.sku}
                                </TableCell>
                                <TableCell className="max-w-xs truncate font-medium text-sm" title={displayName}>
                                    {displayName}
                                    {product.error_message && (
                                        <span className="ml-2 text-xs text-red-500" title={product.error_message}>
                                            ⚠
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right text-sm">
                                    {displayPrice !== undefined ? `$${displayPrice.toFixed(2)}` : '—'}
                                </TableCell>
                                {showSources && (
                                    <TableCell className="text-center">
                                        {sourceCount > 0 ? (
                                            <Badge variant="secondary" className="text-xs">
                                                {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                )}
                                {showConfidence && (
                                    <TableCell className="text-center">
                                        {confidence !== undefined ? (
                                            <Badge
                                                variant="outline"
                                                className={`text-xs ${
                                                    confidence >= 0.8 ? 'border-green-300 text-green-700' :
                                                    confidence >= 0.5 ? 'border-yellow-300 text-yellow-700' :
                                                    'border-red-300 text-red-700'
                                                }`}
                                            >
                                                {Math.round(confidence * 100)}%
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                )}
                                <TableCell className="text-center">
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
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {formatDate(product.updated_at)}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {products.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={showSources ? 8 : showConfidence ? 8 : 6} className="h-32 text-center text-muted-foreground">
                                No products in this stage.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
