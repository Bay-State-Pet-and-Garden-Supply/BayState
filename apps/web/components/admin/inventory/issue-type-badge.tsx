'use client';

import { Badge } from '@/components/ui/badge';

const typeConfig: Record<string, { label: string; color: string }> = {
  register_only: { label: 'Register Only', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  website_only: { label: 'Website Only', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  price_mismatch: { label: 'Price Mismatch', color: 'bg-red-100 text-red-800 border-red-200' },
  quantity_mismatch: { label: 'Qty Mismatch', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  stock_status_mismatch: { label: 'Stock Mismatch', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  duplicate_sku: { label: 'Duplicate SKU', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  invalid_row: { label: 'Invalid', color: 'bg-red-100 text-red-800 border-red-200' },
};

export function IssueTypeBadge({ type }: { type: string }) {
  const cfg = typeConfig[type] ?? { label: type, color: 'bg-gray-100 text-gray-800 border-gray-200' };
  return (
    <Badge variant="outline" className={cfg.color}>
      {cfg.label}
    </Badge>
  );
}
