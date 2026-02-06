/**
 * PresenceGrid - Grid layout for displaying all online runners
 *
 * A responsive grid that organizes runner presence cards
 * with filtering and sorting capabilities.
 */

'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { RunnerPresence } from '@/lib/realtime/types';
import { useRunnerPresence } from '@/lib/realtime';
import { RunnerPresenceCard } from './runner-presence-card';
import { Search, Filter, ArrowUpDown, Users, Zap, Coffee, Power } from 'lucide-react';

const gridVariants = cva('grid gap-3', {
  variants: {
    columns: {
      auto: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      compact: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
      single: 'grid-cols-1',
    },
  },
  defaultVariants: {
    columns: 'auto',
  },
});

type SortOption = 'name' | 'status' | 'lastSeen' | 'activeJobs';
type FilterOption = 'all' | 'online' | 'busy' | 'idle' | 'offline';

interface PresenceGridProps {
  /** Initial runners to show before connection */
  initialRunners?: RunnerPresence[];
  /** Show compact variant */
  compact?: boolean;
  /** Show search bar */
  searchable?: boolean;
  /** Show filter controls */
  filterable?: boolean;
  /** Show sort controls */
  sortable?: boolean;
  /** Number of columns */
  columns?: 'auto' | 'compact' | 'single';
  /** Click handler for runner selection */
  onRunnerClick?: (runner: RunnerPresence) => void;
  /** Callback when runner count changes */
  onCountChange?: (counts: { online: number; busy: number; idle: number; offline: number }) => void;
}

/**
 * Sort runners by the specified option
 */
function sortRunners(runners: RunnerPresence[], sortBy: SortOption): RunnerPresence[] {
  return [...runners].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.runner_name.localeCompare(b.runner_name);
      case 'status':
        // Online > Busy > Idle > Offline
        const statusOrder = { online: 0, busy: 1, idle: 2, offline: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      case 'lastSeen':
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      case 'activeJobs':
        return b.active_jobs - a.active_jobs;
      default:
        return 0;
    }
  });
}

/**
 * Filter runners by status
 */
function filterRunners(runners: RunnerPresence[], filterBy: FilterOption): RunnerPresence[] {
  if (filterBy === 'all') return runners;
  return runners.filter((r) => r.status === filterBy);
}

/**
 * Search runners by name or ID
 */
function searchRunners(runners: RunnerPresence[], query: string): RunnerPresence[] {
  if (!query.trim()) return runners;
  const lowerQuery = query.toLowerCase();
  return runners.filter(
    (r) =>
      r.runner_name.toLowerCase().includes(lowerQuery) ||
      r.runner_id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * PresenceGrid Component
 *
 * @example
 * ```tsx
 * <PresenceGrid
 *   compact={false}
 *   searchable={true}
 *   filterable={true}
 *   onRunnerClick={(r) => setSelectedRunner(r)}
 * />
 * ```
 */
export function PresenceGrid({
  initialRunners = [],
  compact = false,
  searchable = true,
  filterable = true,
  sortable = true,
  columns = 'auto',
  onRunnerClick,
  onCountChange,
}: PresenceGridProps) {
  const {
    runners,
    isConnected,
    getOnlineCount,
    getBusyCount,
  } = useRunnerPresence({
    autoConnect: true,
    onJoin: (id, presence) => {
      console.log(`[PresenceGrid] Runner joined: ${id}`);
    },
    onLeave: (id) => {
      console.log(`[PresenceGrid] Runner left: ${id}`);
    },
  });

  // Local state for filtering/sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('status');

  // Merge initial runners with realtime runners
  const allRunners = useMemo(() => {
    const runnerMap = new Map<string, RunnerPresence>();
    initialRunners.forEach((r) => runnerMap.set(r.runner_id, r));
    Object.values(runners).forEach((r) => runnerMap.set(r.runner_id, r));
    return Array.from(runnerMap.values());
  }, [initialRunners, runners]);

  // Apply filters
  const filteredRunners = useMemo(() => {
    let result = searchRunners(allRunners, searchQuery);
    result = filterRunners(result, filterBy);
    result = sortRunners(result, sortBy);
    return result;
  }, [allRunners, searchQuery, filterBy, sortBy]);

  // Calculate counts
  const counts = useMemo(() => {
    return {
      total: allRunners.length,
      online: allRunners.filter((r) => r.status === 'online').length,
      busy: allRunners.filter((r) => r.status === 'busy').length,
      idle: allRunners.filter((r) => r.status === 'idle').length,
      offline: allRunners.filter((r) => r.status === 'offline').length,
    };
  }, [allRunners]);

  // Notify parent of count changes
  useEffect(() => {
    onCountChange?.(counts);
  }, [counts, onCountChange]);

  // Reset filters
  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterBy('all');
    setSortBy('status');
  }, []);

  const hasFilters = searchQuery || filterBy !== 'all' || sortBy !== 'status';

  // Loading state
  if (!isConnected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 flex-1 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-10 w-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
          <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
        <div className={cn(gridVariants({ columns }))}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      {(searchable || filterable || sortable) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          {searchable && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search runners..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Filter & Sort */}
          <div className="flex gap-2">
            {filterable && (
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={filterBy}
                  onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                  className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                >
                  <option value="all">All ({counts.total})</option>
                  <option value="online">Online ({counts.online})</option>
                  <option value="busy">Busy ({counts.busy})</option>
                  <option value="idle">Idle ({counts.idle})</option>
                  <option value="offline">Offline ({counts.offline})</option>
                </select>
              </div>
            )}

            {sortable && (
              <div className="relative">
                <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                >
                  <option value="status">Status</option>
                  <option value="name">Name</option>
                  <option value="lastSeen">Last Seen</option>
                  <option value="activeJobs">Active Jobs</option>
                </select>
              </div>
            )}

            {hasFilters && (
              <button
                onClick={resetFilters}
                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            isConnected ? 'bg-emerald-500' : 'bg-slate-400'
          )}
        />
        <span className="text-slate-500">
          {isConnected ? 'Connected' : 'Connecting...'}
        </span>
        <span className="text-slate-300 dark:text-slate-600">•</span>
        <span className="text-slate-500">
          {filteredRunners.length} runner{filteredRunners.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      {/* Grid */}
      {filteredRunners.length > 0 ? (
        <div className={cn(gridVariants({ columns }))}>
          {filteredRunners.map((runner) => (
            <RunnerPresenceCard
              key={runner.runner_id}
              runner={runner}
              onClick={onRunnerClick}
              compact={compact}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-slate-500">No runners found</p>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="mt-2 text-sm text-emerald-600 hover:text-emerald-700"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
