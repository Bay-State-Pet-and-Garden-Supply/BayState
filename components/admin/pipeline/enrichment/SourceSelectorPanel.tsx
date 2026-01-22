'use client';

import { Check, Lock, RefreshCw, Circle } from 'lucide-react';

interface Source {
  id: string;
  displayName: string;
  type: 'scraper' | 'b2b';
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  enabled: boolean;
  requiresAuth: boolean;
}

interface SourceSelectorPanelProps {
  /** List of all available enrichment sources */
  sources: Source[];
  /** IDs of currently enabled sources */
  enabledSourceIds: string[];
  /** Callback when a source is toggled */
  onToggleSource: (sourceId: string, enabled: boolean) => void;
  /** Optional callback to refresh a specific source status */
  onRefreshSource?: (sourceId: string) => void;
  /** Global loading state */
  isLoading?: boolean;
}

const STATUS_COLORS = {
  healthy: 'text-green-500',
  degraded: 'text-yellow-500',
  offline: 'text-red-500',
  unknown: 'text-gray-600',
};

/**
 * A panel showing all available enrichment sources (scrapers + B2B) with toggle checkboxes.
 * Designed to fit in a sidebar (max-width ~280px).
 */
export function SourceSelectorPanel({
  sources,
  enabledSourceIds,
  onToggleSource,
  onRefreshSource,
  isLoading = false,
}: SourceSelectorPanelProps) {
  // Group sources by type
  const scrapers = sources.filter((s) => s.type === 'scraper');
  const b2b = sources.filter((s) => s.type === 'b2b');

  const renderSourceRow = (source: Source) => {
    const isEnabled = enabledSourceIds.includes(source.id);

    return (
      <div
        key={source.id}
        className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-md transition-colors group"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <button
            onClick={() => onToggleSource(source.id, !isEnabled)}
            disabled={isLoading}
            className={`
              flex h-5 w-5 shrink-0 items-center justify-center rounded border
              transition-colors focus:outline-none focus:ring-2 focus:ring-[#008850] focus:ring-offset-1
              ${isEnabled 
                ? 'bg-[#008850] border-[#008850] text-white' 
                : 'border-gray-300 bg-white hover:border-[#008850]'
              }
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            role="checkbox"
            aria-checked={isEnabled}
            aria-label={`Enable ${source.displayName}`}
          >
            {isEnabled && <Check className="h-3.5 w-3.5" />}
          </button>
          
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-700 truncate block max-w-[140px]">
                {source.displayName}
              </span>
              {source.requiresAuth && (
                <Lock className="h-3 w-3 text-gray-600 shrink-0" aria-label="Requires authentication" />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="tooltip-container relative group/tooltip">
            <Circle 
              className={`h-2.5 w-2.5 fill-current ${STATUS_COLORS[source.status]}`} 
              aria-label={`Status: ${source.status}`}
            />
          </div>
          
          {onRefreshSource && (
            <button
              onClick={() => onRefreshSource(source.id)}
              disabled={isLoading}
              className="p-1 text-gray-600 hover:text-[#008850] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
              title="Refresh status"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[280px] bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-semibold text-gray-900">Data Sources</h3>
        <p className="text-xs text-gray-600 mt-1">Select sources to enrich product data</p>
      </div>

      <div className="p-2 space-y-4">
        {/* Scrapers Section */}
        {scrapers.length > 0 && (
          <div>
            <h4 className="px-3 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Scrapers
            </h4>
            <div className="mt-1 space-y-0.5">
              {scrapers.map(renderSourceRow)}
            </div>
          </div>
        )}

        {/* B2B Section */}
        {b2b.length > 0 && (
          <div>
            <h4 className="px-3 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              B2B Integrations
            </h4>
            <div className="mt-1 space-y-0.5">
              {b2b.map(renderSourceRow)}
            </div>
          </div>
        )}

        {sources.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-600 italic">
            No sources available
          </div>
        )}
      </div>
    </div>
  );
}
