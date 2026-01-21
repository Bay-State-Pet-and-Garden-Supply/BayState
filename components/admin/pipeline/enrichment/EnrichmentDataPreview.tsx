'use client';

import { AlertTriangle, Database } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ResolvedField {
  field: string;
  value: unknown;
  source: string;
  hasConflict: boolean;
}

interface EnrichmentDataPreviewProps {
  /** The product SKU */
  sku: string;
  /** The base price from the original import (read-only) */
  originalPrice: number;
  /** List of enriched fields and their resolved values */
  resolvedData: ResolvedField[];
  /** Callback when a field is clicked (e.g., to resolve conflict) */
  onFieldClick?: (field: string) => void;
}

/**
 * Shows the "Golden Record" with source attribution for each field.
 * Allows clicking on fields to inspect sources or resolve conflicts.
 */
export function EnrichmentDataPreview({
  sku,
  originalPrice,
  resolvedData,
  onFieldClick,
}: EnrichmentDataPreviewProps) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden w-full">
      {/* Header Section */}
      <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Golden Record Preview</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-sm text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
              {sku}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-md border border-gray-200 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">Original Price</span>
            <span className="text-lg font-bold text-[#66161D]">{formatCurrency(originalPrice)}</span>
          </div>
          <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-1 rounded-full whitespace-nowrap border border-gray-200">
            From Import
          </span>
        </div>
      </div>

      {/* Enriched Fields List */}
      <div className="divide-y divide-gray-100">
        {resolvedData.map((item) => (
          <div
            key={item.field}
            onClick={() => onFieldClick?.(item.field)}
            className={`
              group flex items-center justify-between p-4 transition-colors
              ${onFieldClick ? 'cursor-pointer hover:bg-gray-50' : ''}
              ${item.hasConflict ? 'bg-amber-50/40 hover:bg-amber-50' : ''}
            `}
            role={onFieldClick ? 'button' : undefined}
            tabIndex={onFieldClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onFieldClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onFieldClick(item.field);
              }
            }}
          >
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {item.field}
                </span>
                {item.hasConflict && (
                  <div className="flex items-center gap-1 text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    Conflict
                  </div>
                )}
              </div>
              <div className="text-sm font-medium text-gray-900 truncate" title={String(item.value)}>
                {formatValue(item.value)}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <span 
                className={`
                  inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                  ${item.hasConflict 
                    ? 'bg-white border-amber-200 text-amber-700' 
                    : 'bg-white border-gray-200 text-gray-600 group-hover:border-[#008850] group-hover:text-[#008850] transition-colors'
                  }
                `}
              >
                <Database className="h-3 w-3 opacity-70" />
                {item.source}
              </span>
            </div>
          </div>
        ))}

        {resolvedData.length === 0 && (
          <div className="p-8 text-center text-gray-600 italic">
            No enriched data available yet. Select sources to begin enrichment.
          </div>
        )}
      </div>
    </div>
  );
}
