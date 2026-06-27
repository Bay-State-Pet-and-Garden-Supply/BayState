'use client';

import { useMemo, useState } from 'react';
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
import { Link2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PdpSeedRow } from './ProfileMaintenanceClient';

// =============================================================================
// Trust status → Badge variant
// =============================================================================

const TRUST_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'outline'> = {
  verified: 'success',
  rejected: 'destructive',
  candidate: 'warning',
  expired: 'outline',
};

// =============================================================================
// Props
// =============================================================================

interface SeedListProps {
  seeds: PdpSeedRow[];
  search: string;
}

// =============================================================================
// Component
// =============================================================================

export function SeedList({ seeds, search }: SeedListProps) {
  const [trustFilter, setTrustFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = seeds;

    if (trustFilter !== 'all') {
      result = result.filter((s) => s.trust_status === trustFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.url.toLowerCase().includes(q) ||
          s.normalized_url.toLowerCase().includes(q) ||
          s.canonical_domain.toLowerCase().includes(q),
      );
    }

    return result;
  }, [seeds, trustFilter, search]);

  const trustOptions = useMemo(
    () => [...new Set(seeds.map((s) => s.trust_status))].sort(),
    [seeds],
  );

  if (seeds.length === 0) {
    return (
      <AdminEmptyState
        icon={Link2}
        title="No PDP seeds"
        description="Product detail page seeds are created through brand source setup or auto-discovery."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Trust status</span>
          <Select value={trustFilter} onValueChange={setTrustFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {trustOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-xs text-muted-foreground">
          {filtered.length} of {seeds.length} seed{seeds.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>URL</TableHead>
              <TableHead>Trust Status</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-20">Artifact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No seeds match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((seed) => (
                <TableRow key={seed.id}>
                  <TableCell className="max-w-[320px]">
                    <div className="flex flex-col gap-0.5">
                      <a
                        href={seed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-xs font-medium text-primary hover:underline"
                      >
                        {seed.url}
                        <ExternalLink className="ml-1 inline h-3 w-3 shrink-0" />
                      </a>
                      {seed.normalized_url !== seed.url && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {seed.normalized_url}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <TrustBadge status={seed.trust_status} />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {seed.canonical_domain}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {seed.verified_at ? formatDate(seed.verified_at) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(seed.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {seed.verification_artifact_id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        asChild
                      >
                        <a
                          href={`/api/admin/profile-maintenance/artifacts/${seed.verification_artifact_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          View
                        </a>
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
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
// Inline trust badge
// =============================================================================

function TrustBadge({ status }: { status: string }) {
  const variant = TRUST_VARIANT[status] ?? 'outline';
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
