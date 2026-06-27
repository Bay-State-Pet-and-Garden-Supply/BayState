'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Briefcase } from 'lucide-react';
import type { ProfileMaintenanceJobRow } from './ProfileMaintenanceClient';

// =============================================================================
// Status → Badge variant mapping
// =============================================================================

const JOB_STATUS_VARIANT: Record<string, 'warning' | 'default' | 'success' | 'destructive' | 'outline' | 'secondary'> = {
  queued: 'warning',
  claimed: 'secondary',
  running: 'default',
  succeeded: 'success',
  failed: 'destructive',
  timed_out: 'destructive',
  cancelled: 'outline',
};

const JOB_KIND_LABEL: Record<string, string> = {
  verify_pdp_seed: 'Verify PDP Seed',
  draft_site_extraction_profile: 'Draft Profile',
  validate_profile_version: 'Validate Version',
  browser_profile_setup: 'Browser Profile Setup',
  browser_profile_revalidate: 'Browser Profile Revalidate',
};

// =============================================================================
// Props
// =============================================================================

interface JobListProps {
  jobs: ProfileMaintenanceJobRow[];
  search: string;
}

// =============================================================================
// Component
// =============================================================================

export function JobList({ jobs, search }: JobListProps) {
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = jobs;

    // Kind filter
    if (kindFilter !== 'all') {
      result = result.filter((j) => j.kind === kindFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((j) => j.status === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.kind.toLowerCase().includes(q) ||
          (j.brand_id ?? '').toLowerCase().includes(q) ||
          (j.source_slug ?? '').toLowerCase().includes(q) ||
          (j.canonical_domain ?? '').toLowerCase().includes(q),
      );
    }

    return result;
  }, [jobs, kindFilter, statusFilter, search]);

  // Derive available filter options from data
  const kindOptions = useMemo(
    () => [...new Set(jobs.map((j) => j.kind))].sort(),
    [jobs],
  );
  const statusOptions = useMemo(
    () => [...new Set(jobs.map((j) => j.status))].sort(),
    [jobs],
  );

  if (jobs.length === 0) {
    return (
      <AdminEmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Profile-maintenance jobs appear here when they are queued by the system."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Kind</span>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {kindOptions.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {JOB_KIND_LABEL[kind] ?? kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Status</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
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

        <span className="self-center text-xs text-muted-foreground">
          {filtered.length} of {jobs.length} job{jobs.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Brand / Domain</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-20">Artifacts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No jobs match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <span className="whitespace-nowrap text-xs font-medium">
                      {JOB_KIND_LABEL[job.kind] ?? job.kind}
                    </span>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {job.source_slug && (
                        <span className="text-xs font-medium text-foreground">
                          {job.source_slug}
                        </span>
                      )}
                      {job.canonical_domain && (
                        <span className="text-[11px] text-muted-foreground">
                          {job.canonical_domain}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {job.attempt_count}/{job.max_attempts}
                    </span>
                    {job.error_message && (
                      <span
                        className="ml-1 inline-block cursor-help text-[10px] text-destructive"
                        title={job.error_message}
                      >
                        ⚠
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      asChild
                    >
                      <a
                        href={`/api/admin/profile-maintenance/jobs/${job.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1 h-3 w-3" />
                        View
                      </a>
                    </Button>
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
// Inline status badge (avoids coupling to the order-specific StatusBadge)
// =============================================================================

function JobStatusBadge({ status }: { status: string }) {
  const variant = JOB_STATUS_VARIANT[status] ?? 'outline';
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
