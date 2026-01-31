/**
 * HistoricalTestRuns Component
 *
 * Displays a list of past test runs with filtering, sorting, and pagination.
 * Shows date/time, scraper name, status, SKU count, and duration.
 * Click to view full details (links to TestRunDetailView).
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  History,
  Calendar,
  Clock,
  Filter,
  ArrowUpDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { useTestRunManager } from '@/lib/contexts/TestRunManagerContext';

// Constants
const ITEMS_PER_PAGE = 20;
const MAX_TOTAL_RUNS = 100;
const RETENTION_DAYS = 30;

/** Test run record interface - matches database schema */
interface TestRunRecord {
  id: string;
  scraper_id: string;
  scraper_name: string | null;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[] | null;
  passed_count: number | null;
  failed_count: number | null;
  error_message?: string | null;
}

/** Filter state interface */
interface FilterState {
  scraper: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

/** Sort state interface */
interface SortState {
  field: 'created_at' | 'duration_ms' | 'status' | 'passed_count';
  direction: 'asc' | 'desc';
}

/** Props for the HistoricalTestRuns component */
interface HistoricalTestRunsProps {
  /** Optional callback when a run is selected */
  onRunSelect?: (runId: string) => void;
  /** Optional CSS class */
  className?: string;
}

/** Get status badge configuration */
function getStatusBadge(status: string) {
  const normalizedStatus = status.toLowerCase() as TestRunRecord['status'];
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2; label: string; className: string }> = {
    passed: {
      variant: 'default',
      icon: CheckCircle2,
      label: 'Passed',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    },
    failed: {
      variant: 'destructive',
      icon: XCircle,
      label: 'Failed',
      className: 'bg-red-100 text-red-700 border-red-200',
    },
    partial: {
      variant: 'secondary',
      icon: MinusCircle,
      label: 'Partial',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    },
    running: {
      variant: 'outline',
      icon: Clock,
      label: 'Running',
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    pending: {
      variant: 'outline',
      icon: Clock,
      label: 'Pending',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
    cancelled: {
      variant: 'secondary',
      icon: AlertCircle,
      label: 'Cancelled',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
  };
  return config[normalizedStatus] || config.pending;
}

/** Format duration from milliseconds */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/** Format date for display */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Calculate date filter cutoff (30 days ago) */
function getDateCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  return cutoff;
}

/**
 * HistoricalTestRuns Component
 *
 * Displays a paginated, filterable, sortable list of historical test runs.
 */
export function HistoricalTestRuns({
  onRunSelect,
  className,
}: HistoricalTestRunsProps) {
  const { historicalRuns, isLoading, error, loadHistoricalRuns } = useTestRunManager();

  const [filter, setFilter] = useState<FilterState>({
    scraper: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const [sort, setSort] = useState<SortState>({
    field: 'created_at',
    direction: 'desc',
  });

  const [page, setPage] = useState(1);

  // Load historical runs on mount
  useEffect(() => {
    loadHistoricalRuns();
  }, [loadHistoricalRuns]);

  // Normalize runs from context to our interface
  const allRuns = useMemo(() => {
    return (historicalRuns as unknown as TestRunRecord[]).map((run) => ({
      id: run.id,
      scraper_id: run.scraper_id,
      scraper_name: run.scraper_name || null,
      test_type: run.test_type || 'manual',
      status: run.status || 'pending',
      created_at: run.created_at,
      duration_ms: run.duration_ms ?? null,
      skus_tested: (run.skus_tested as string[]) || [],
      passed_count: run.passed_count ?? 0,
      failed_count: run.failed_count ?? 0,
      error_message: run.error_message ?? null,
    }));
  }, [historicalRuns]);

  // Filter runs
  const filteredRuns = useMemo(() => {
    const cutoff = getDateCutoff();
    const cutoffDate = cutoff.toISOString();

    return allRuns.filter((run) => {
      // Filter by scraper
      if (filter.scraper !== 'all' && run.scraper_id !== filter.scraper && run.scraper_name !== filter.scraper) {
        return false;
      }

      // Filter by status
      if (filter.status !== 'all' && run.status !== filter.status) {
        return false;
      }

      // Filter by date from
      if (filter.dateFrom && run.created_at < new Date(filter.dateFrom).toISOString()) {
        return false;
      }

      // Filter by date to
      if (filter.dateTo) {
        const toDate = new Date(filter.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (run.created_at > toDate.toISOString()) {
          return false;
        }
      }

      // Filter by retention (30 days)
      if (run.created_at < cutoffDate) {
        return false;
      }

      return true;
    });
  }, [allRuns, filter]);

  // Sort runs
  const sortedRuns = useMemo(() => {
    return [...filteredRuns].sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'duration_ms':
          comparison = (a.duration_ms || 0) - (b.duration_ms || 0);
          break;
        case 'status':
          // Define status order: failed < partial < passed < running < pending < cancelled
          const statusOrder: Record<string, number> = {
            failed: 0,
            partial: 1,
            passed: 2,
            running: 3,
            pending: 4,
            cancelled: 5,
          };
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
          break;
        case 'passed_count':
          comparison = a.passed_count - b.passed_count;
          break;
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredRuns, sort]);

  // Paginate runs
  const paginatedRuns = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedRuns.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedRuns, page]);

  const totalPages = Math.ceil(sortedRuns.length / ITEMS_PER_PAGE);

  // Get unique scrapers for filter dropdown
  const uniqueScrapers = useMemo(() => {
    const scrapers = new Map<string, string>();
    allRuns.forEach((run) => {
      const key = run.scraper_id || run.scraper_name || 'unknown';
      if (!scrapers.has(key)) {
        scrapers.set(key, run.scraper_name || run.scraper_id || 'Unknown');
      }
    });
    return Array.from(scrapers.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRuns]);

  // Handle sort change
  const handleSort = useCallback((field: SortState['field']) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  // Handle run click
  const handleRunClick = useCallback(
    (runId: string) => {
      onRunSelect?.(runId);
    },
    [onRunSelect]
  );

  // Handle filter change
  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilter({
      scraper: 'all',
      status: 'all',
      dateFrom: '',
      dateTo: '',
    });
    setPage(1);
  }, []);

  // Refresh runs
  const handleRefresh = useCallback(() => {
    loadHistoricalRuns();
    setPage(1);
  }, [loadHistoricalRuns]);

  // Calculate stats
  const stats = useMemo(() => {
    const passed = filteredRuns.filter((r) => r.status === 'passed').length;
    const failed = filteredRuns.filter((r) => r.status === 'failed').length;
    const partial = filteredRuns.filter((r) => r.status === 'partial').length;
    return { passed, failed, partial, total: filteredRuns.length };
  }, [filteredRuns]);

  // Early return for empty state after loading
  if (!isLoading && allRuns.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-600">
              <History className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Test Run History</CardTitle>
          </div>
          <CardDescription>View past test run results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No test runs yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Run your first test to see results here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-600">
              <History className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Test Run History</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {stats.total > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700">
                  {stats.passed} passed
                </Badge>
                <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700">
                  {stats.failed} failed
                </Badge>
                <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                  {stats.partial} partial
                </Badge>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <History className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
        <CardDescription>
          {filteredRuns.length > 0
            ? `Showing ${filteredRuns.length} runs from the last ${RETENTION_DAYS} days`
            : `No test runs in selected period`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <Select
            value={filter.scraper}
            onValueChange={(v) => handleFilterChange('scraper', v)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All scrapers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scrapers</SelectItem>
              {uniqueScrapers.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filter.status}
            onValueChange={(v) => handleFilterChange('status', v)}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <Input
              type="date"
              placeholder="From"
              value={filter.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-36"
            />
            <span className="text-gray-400">-</span>
            <Input
              type="date"
              placeholder="To"
              value={filter.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-36"
            />
          </div>

          {(filter.scraper !== 'all' ||
            filter.status !== 'all' ||
            filter.dateFrom ||
            filter.dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
            <Button variant="ghost" size="sm" onClick={handleRefresh} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            {/* Skeleton filters */}
            <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg border">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-36" />
            </div>

            {/* Skeleton table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50/50 p-3 border-b">
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="divide-y">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </div>
            </div>

            {/* Skeleton pagination */}
            <div className="flex justify-center gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        )}

        {/* Empty filtered state */}
        {!isLoading && filteredRuns.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <History className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No test runs in selected period</p>
            <p className="text-sm text-gray-500 mt-1">
              Try adjusting your filters or run a new test
            </p>
          </div>
        )}

        {/* Runs table */}
        {!isLoading && filteredRuns.length > 0 && (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-48">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('created_at')}
                        className="flex items-center gap-1 hover:bg-transparent"
                      >
                        Date/Time
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-40">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 hover:bg-transparent"
                      >
                        Status
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-40">Scraper</TableHead>
                    <TableHead className="w-24 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('passed_count')}
                        className="flex items-center gap-1 hover:bg-transparent"
                      >
                        SKUs
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-24">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('duration_ms')}
                        className="flex items-center gap-1 hover:bg-transparent"
                      >
                        Duration
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRuns.map((run) => {
                    const statusConfig = getStatusBadge(run.status);
                    const StatusIcon = statusConfig.icon;
                    const totalSkus = (run.skus_tested?.length || 0);

                    return (
                      <TableRow
                        key={run.id}
                        className="cursor-pointer hover:bg-gray-50/80 transition-colors"
                        onClick={() => handleRunClick(run.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(run.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${statusConfig.className} font-medium flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{run.scraper_name || 'Unknown'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-mono font-medium">{totalSkus}</span>
                            {run.failed_count > 0 && (
                              <span className="text-xs text-red-500">({run.failed_count} failed)</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDuration(run.duration_ms)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;

                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPage(pageNum)}
                          isActive={page === pageNum}
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  {totalPages > 5 && page < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}

            {/* Results summary */}
            <div className="text-xs text-muted-foreground text-center">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, filteredRuns.length)} of {filteredRuns.length} runs
              {filteredRuns.length >= MAX_TOTAL_RUNS && ` (showing most recent ${MAX_TOTAL_RUNS})`}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
