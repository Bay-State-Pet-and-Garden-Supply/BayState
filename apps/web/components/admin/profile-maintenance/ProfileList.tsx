'use client';

import { useMemo, useState } from 'react';
import { FileText, CheckCircle2, Play, Wrench } from 'lucide-react';
import { toast } from 'sonner';
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
import type { SiteExtractionProfileRow } from './ProfileMaintenanceClient';

// =============================================================================
// Status → Badge variant
// =============================================================================

const PROFILE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'> = {
  draft: 'warning',
  active: 'success',
  disabled: 'outline',
  needs_attention: 'destructive',
};

// =============================================================================
// Props
// =============================================================================

interface ProfileListProps {
  profiles: SiteExtractionProfileRow[];
  search: string;
  draftVersionByProfile?: Record<string, { id: string; version_number: number }>;
}

// =============================================================================
// Component
// =============================================================================

export function ProfileList({ profiles, search, draftVersionByProfile = {} }: ProfileListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = profiles;

    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          (p.brands?.name ?? '').toLowerCase().includes(q) ||
          p.source_slug.toLowerCase().includes(q) ||
          p.canonical_domain.toLowerCase().includes(q),
      );
    }

    return result;
  }, [profiles, statusFilter, search]);

  const statusOptions = useMemo(
    () => [...new Set(profiles.map((p) => p.status))].sort(),
    [profiles],
  );

  if (profiles.length === 0) {
    return (
      <AdminEmptyState
        icon={FileText}
        title="No extraction profiles"
        description="Site extraction profiles are created through the brand source setup wizard."
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

        <span className="text-xs text-muted-foreground">
          {filtered.length} of {profiles.length} profile{profiles.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Brand</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active Version</TableHead>
              <TableHead>Setup</TableHead>
              <TableHead>Actions</TableHead>
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
                  No profiles match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <span className="text-xs font-semibold text-foreground">
                      {profile.brands?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-foreground">
                      {profile.source_slug}
                    </span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({profile.source_type})
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {profile.canonical_domain}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ProfileStatusBadge status={profile.status} />
                  </TableCell>
                  <TableCell>
                    {profile.active_version_id ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono"
                      >
                        v{profile.active_version_id.slice(0, 8)}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {profile.profile_setup_completed_at ? (
                      <Badge
                        variant="success"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        Done
                      </Badge>
                    ) : (
                      <Badge
                        variant="warning"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProfileActions profile={profile} draftVersionByProfile={draftVersionByProfile} />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(profile.created_at)}
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
// Inline profile status badge
// =============================================================================

function ProfileStatusBadge({ status }: { status: string }) {
  const variant = PROFILE_STATUS_VARIANT[status] ?? 'outline';
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

// =============================================================================
// ProfileActions — Validate/Approve for draft profiles
// =============================================================================

function ProfileActions({ profile, draftVersionByProfile }: { profile: SiteExtractionProfileRow; draftVersionByProfile: Record<string, { id: string; version_number: number }> }) {
  const [loading, setLoading] = useState<'validate' | 'approve' | null>(null);

  const rowActions: React.ReactNode[] = [];

  // Workshop button — available for all profiles
  rowActions.push(
    <Button
      key="workshop"
      size="sm"
      variant="outline"
      onClick={() => { window.location.href = `/admin/profile-maintenance/profiles/${profile.id}/workshop`; }}
      className="h-7 text-[10px] font-semibold rounded-none"
    >
      <Wrench className="h-3 w-3 mr-1" />
      Workshop
    </Button>
  );

  const draftVersion = draftVersionByProfile[profile.id];
  if (profile.status !== 'draft' || !draftVersion) {
    return <div className="flex gap-1">{rowActions}</div>;
  }

  const handleValidate = async () => {
    setLoading('validate');
    try {
      const res = await fetch(
        `/api/admin/site-extraction-profiles/${profile.id}/versions/${draftVersion.id}/validate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
      toast.success('Validation job enqueued. Check jobs tab for results.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(null);
    }
  };

  rowActions.push(
    <Button
      key="validate"
      size="sm"
      variant="outline"
      onClick={() => void handleValidate()}
      disabled={loading === 'validate'}
      className="h-7 text-[10px] font-semibold rounded-none"
    >
      <Play className="h-3 w-3 mr-1" />
      Validate
    </Button>
  );

  return (
    <div className="flex gap-1">{rowActions}</div>
  );
}
