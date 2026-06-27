'use client';

import { useMemo, useState } from 'react';
import { Monitor } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import type { BrowserProfileRow } from './ProfileMaintenanceClient';

// =============================================================================
// Status → Badge variant
// =============================================================================

const BROWSER_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'> = {
  requested: 'warning',
  assigned: 'secondary',
  in_progress: 'secondary',
  validated: 'success',
  validation_failed: 'destructive',
  expired: 'outline',
  revoked: 'outline',
};

// =============================================================================
// Props
// =============================================================================

interface BrowserProfileListProps {
  browserProfiles: BrowserProfileRow[];
  search: string;
}

// =============================================================================
// Component
// =============================================================================

export function BrowserProfileList({ browserProfiles, search }: BrowserProfileListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [requiredFilter, setRequiredFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = browserProfiles;

    if (statusFilter !== 'all') {
      result = result.filter((bp) => bp.status === statusFilter);
    }

    if (requiredFilter === 'required') {
      result = result.filter((bp) => bp.required);
    } else if (requiredFilter === 'optional') {
      result = result.filter((bp) => !bp.required);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (bp) =>
          (bp.brands?.name ?? '').toLowerCase().includes(q) ||
          bp.source_slug.toLowerCase().includes(q) ||
          bp.canonical_domain.toLowerCase().includes(q) ||
          (bp.runner_name ?? '').toLowerCase().includes(q),
      );
    }

    return result;
  }, [browserProfiles, statusFilter, requiredFilter, search]);

  const statusOptions = useMemo(
    () => [...new Set(browserProfiles.map((bp) => bp.status))].sort(),
    [browserProfiles],
  );

  if (browserProfiles.length === 0) {
    return (
      <AdminEmptyState
        icon={Monitor}
        title="No browser profiles"
        description="Browser profiles are created on demand when a brand source requires authenticated extraction."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Status</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Required</span>
          <Select value={requiredFilter} onValueChange={setRequiredFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          {filtered.length} of {browserProfiles.length} profile{browserProfiles.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Brand</TableHead>
              <TableHead>Source / Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Runner</TableHead>
              <TableHead>Last Validated</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No browser profiles match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((bp) => (
                <TableRow key={bp.id}>
                  <TableCell>
                    <span className="text-xs font-semibold text-foreground">
                      {bp.brands?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-foreground">
                        {bp.source_slug}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {bp.canonical_domain}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <BrowserStatusBadge status={bp.status} />
                  </TableCell>
                  <TableCell>
                    {bp.required ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        Required
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        Optional
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {bp.environment}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {bp.runner_name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {bp.last_validated_at
                        ? formatDate(bp.last_validated_at)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(bp.created_at)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// =============================================================================
// Inline browser status badge
// =============================================================================

function BrowserStatusBadge({ status }: { status: string }) {
  const variant = BROWSER_STATUS_VARIANT[status] ?? 'outline';
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wider">
      {status}
    </Badge>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
