'use client';

import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface ConflictOption {
  sourceId: string;
  sourceName: string;
  value: unknown;
  isSelected: boolean;
}

interface ConflictResolutionCardProps {
  /** The name of the field with conflicting values */
  field: string;
  /** List of available values from different sources */
  options: ConflictOption[];
  /** Callback when a specific source is selected as the winner */
  onSelectSource: (sourceId: string) => void;
  /** Callback to close the resolution card */
  onClose: () => void;
}

/**
 * A card interface for resolving data conflicts between multiple sources.
 * Displays all available values and allows the user to pick a winner.
 */
export function ConflictResolutionCard({
  field,
  options,
  onSelectSource,
  onClose,
}: ConflictResolutionCardProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    options.find(o => o.isSelected)?.sourceId || ''
  );

  const handleSave = () => {
    if (selectedSourceId) {
      onSelectSource(selectedSourceId);
      onClose();
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-amber-100 p-1.5 rounded-md text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-600">Resolve Conflict</h3>
            <p className="text-lg font-bold text-gray-900 leading-tight">{field}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Options List */}
      <div className="p-5 space-y-3">
        <p className="text-sm text-gray-600 mb-2">
          Multiple sources provided different values. Select the correct one:
        </p>

        {options.map((option) => (
          <label
            key={option.sourceId}
            className={`
              relative flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all
              ${selectedSourceId === option.sourceId
                ? 'border-[#008850] bg-green-50/30'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex-1 min-w-0 pr-4">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-0.5">
                {option.sourceName}
              </span>
              <span className="text-base font-medium text-gray-900 break-words">
                {formatValue(option.value)}
              </span>
            </div>

            <div className="shrink-0">
              <input
                type="radio"
                name="conflict-resolution"
                value={option.sourceId}
                checked={selectedSourceId === option.sourceId}
                onChange={() => setSelectedSourceId(option.sourceId)}
                className="sr-only"
              />
              <div
                className={`
                  h-5 w-5 rounded-full border flex items-center justify-center transition-colors
                  ${selectedSourceId === option.sourceId
                    ? 'border-[#008850] bg-[#008850] text-white'
                    : 'border-gray-300 bg-white'
                  }
                `}
              >
                {selectedSourceId === option.sourceId && (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!selectedSourceId}
          className={`
            px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#008850]
            ${selectedSourceId
              ? 'bg-[#008850] hover:bg-[#006f41]'
              : 'bg-gray-300 cursor-not-allowed'
            }
          `}
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
}
