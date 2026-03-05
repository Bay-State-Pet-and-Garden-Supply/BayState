'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ExternalLink,
  XCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DataTable,
  Column,
} from '@/components/admin/data-table';

import type { ScraperRunRecord } from '@/lib/admin/scrapers/runs-types';

interface RunnerRunHistoryProps {
  runnerId: string;
  runnerName: string;
}

interface RunFilters {
  status: string;
  scraperName: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  claimed: { label: 'Claimed', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  running: { label: 'Running', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config?.icon || Clock;

  return (
    <Badge className={config?.color || 'bg-gray-100 text-gray-700'}>
      <Icon className="mr-1 h-3 w-3" />
      {config?.label || status}
    </Badge>
  );
}

export function RunnerRunHistory({ runnerId, runnerName }: RunnerRunHistoryProps) {
  const [runs, setRuns] = useState<ScraperRunRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<RunFilters>({
    status: 'all',
    scraperName: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        runner_id: runnerId,
        offset: String(page * pageSize),
        limit: String(pageSize),
      });

      if (filters.status !== 'all') {
        params.append('status', filters.status);
      }
      if (filters.scraperName) {
        params.append('scraper', filters.scraperName);
      }
      if (filters.dateFrom) {
        params.append('date_from', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.append('date_to', filters.dateTo);
      }
      if (filters.search) {
        params.append('search', filters.search);
      }

      const res = await fetch(`/api/admin/scraper-network/jobs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch runs');
      
      const data = await res.json();
      setRuns(data.jobs || []);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error('Error fetching runs:', error);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [runnerId, page, pageSize, filters]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const columns: Column<ScraperRunRecord>[] = [
    {
      key: 'id',
      header: 'Job ID',
      sortable: true,
      searchable: true,
      render: (value) => (
        <span className="font-mono text-xs">
          {String(value).slice(0, 8)}...
        </span>
      ),
    },
    {
      key: 'scraper_name',
      header: 'Scraper',
      sortable: true,
      searchable: true,
      render: (value) => (
        <span className="font-medium capitalize">
          {String(value)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'total_skus',
      header: 'SKUs',
      sortable: true,
      render: (value, row) => {
        const completed = row.completed_skus || 0;
        const failed = row.failed_skus || 0;
        const total = Number(value) || 0;
        return (
          <span className="text-sm">
            {completed}/{total}
            {failed > 0 && <span className="text-red-600"> ({failed} failed)</span>}
          </span>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Started',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value ? format(new Date(String(value)), 'MMM d, h:mm a') : '-'}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: false,
      render: (_, row) => {
        if (!row.created_at) return '-';
        const start = new Date(row.created_at);
        const end = row.completed_at ? new Date(row.completed_at) : new Date();
        const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          {row.status === 'completed' && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/admin/scrapers/runs/${row.id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="w-40">
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Input
              placeholder="Search scraper..."
              value={filters.scraperName}
              onChange={(e) => setFilters({ ...filters, scraperName: e.target.value })}
            />
          </div>
          <div className="w-40">
            <Input
              type="date"
              placeholder="From"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div className="w-40">
            <Input
              type="date"
              placeholder="To"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
          <Button variant="outline" onClick={fetchRuns}>
            Apply Filters
          </Button>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          {totalCount} run{totalCount !== 1 ? 's' : ''} for {runnerName}
        </p>

        {/* Data Table */}
        <DataTable
          data={runs}
          columns={columns}
          searchPlaceholder="Search runs..."
          pageSize={pageSize}
          loading={loading}
          emptyMessage="No runs found for this runner."
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="25">25 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
