'use client';

import { useMemo, useState, useCallback } from 'react';
import { BookMarked, CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export interface ExplicitCorrectionRow {
  id: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  profile_id: string | null;
  profile_version_id: string | null;
  target_field: string;
  correction_type: 'accepted' | 'rejected';
  evidence_summary: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Props
// =============================================================================

interface CorrectionsListProps {
  corrections: ExplicitCorrectionRow[];
  search: string;
  onCorrectionsChange?: () => void;
}

// =============================================================================
// Status helpers
// =============================================================================

const CORRECTION_TYPE_CONFIG = {
  accepted: {
    label: 'Accepted',
    variant: 'success' as const,
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive' as const,
    icon: XCircle,
  },
};

// =============================================================================
// Component
// =============================================================================

export function CorrectionsList({ corrections, search, onCorrectionsChange }: CorrectionsListProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [fieldFilter, setFieldFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{
    version?: Record<string, unknown>;
    validateJob?: Record<string, unknown> | null;
  } | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Derive available filter options
  const typeOptions = useMemo(
    () => [...new Set(corrections.map((c) => c.correction_type))].sort(),
    [corrections],
  );
  const fieldOptions = useMemo(
    () => [...new Set(corrections.map((c) => c.target_field))].sort(),
    [corrections],
  );

  // Filtered list
  const filtered = useMemo(() => {
    let result = corrections;

    if (typeFilter !== 'all') {
      result = result.filter((c) => c.correction_type === typeFilter);
    }
    if (fieldFilter !== 'all') {
      result = result.filter((c) => c.target_field === fieldFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.target_field.toLowerCase().includes(q) ||
          c.source_slug.toLowerCase().includes(q) ||
          c.canonical_domain.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }

    return result;
  }, [corrections, typeFilter, fieldFilter, search]);

  // Group corrections by source scope for the promote button
  const scopeGroups = useMemo(() => {
    const groups = new Map<string, ExplicitCorrectionRow[]>();
    for (const c of filtered) {
      const key = `${c.brand_id}::${c.source_slug}::${c.canonical_domain}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return groups;
  }, [filtered]);

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select all in current filter
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }, [filtered, selectedIds]);

  // Promote selected
  const handlePromote = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsPromoting(true);
    setPromoteError(null);
    setPromoteResult(null);

    try {
      const response = await fetch('/api/admin/explicit-corrections/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_ids: Array.from(selectedIds),
          auto_validate: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPromoteError(data.error ?? 'Failed to promote corrections');
        toast.error(data.error ?? 'Failed to promote corrections');
        return;
      }

      setPromoteResult(data);
      toast.success(`Created draft version from ${selectedIds.size} correction${selectedIds.size === 1 ? '' : 's'}`);

      // Clear selection and notify parent
      setSelectedIds(new Set());
      onCorrectionsChange?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setPromoteError(message);
      toast.error(message);
    } finally {
      setIsPromoting(false);
    }
  }, [selectedIds, onCorrectionsChange]);

  if (corrections.length === 0) {
    return (
      <AdminEmptyState
        icon={BookMarked}
        title="No corrections yet"
        description="Explicit corrections appear here when admins mark field-level evidence as reusable extractor teaching data."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter and action row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Type</span>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CORRECTION_TYPE_CONFIG[type as keyof typeof CORRECTION_TYPE_CONFIG]?.label ?? type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Field</span>
            <Select value={fieldFilter} onValueChange={setFieldFilter}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fields</SelectItem>
                {fieldOptions.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span className="self-center text-xs text-muted-foreground">
            {filtered.length} of {corrections.length} correction{corrections.length === 1 ? '' : 's'}
            {selectedIds.size > 0 && (
              <span className="ml-1">
                ({selectedIds.size} selected)
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
          >
            {selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            disabled={selectedIds.size === 0}
            onClick={() => setPromoteDialogOpen(true)}
          >
            <BookMarked className="mr-1 h-3.5 w-3.5" />
            Promote ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[1rem] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all corrections"
                />
              </TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source / Domain</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-16">ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No corrections match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((correction) => {
                const config = CORRECTION_TYPE_CONFIG[correction.correction_type];
                const Icon = config?.icon ?? BookMarked;

                return (
                  <TableRow key={correction.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-border"
                        checked={selectedIds.has(correction.id)}
                        onChange={() => toggleSelect(correction.id)}
                        aria-label={`Select correction ${correction.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium">
                        {correction.target_field}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={config?.variant ?? 'outline'} className="text-[10px] uppercase tracking-wider gap-1">
                        <Icon className="h-3 w-3" />
                        {config?.label ?? correction.correction_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {correction.source_slug && (
                          <span className="text-xs font-medium text-foreground">
                            {correction.source_slug}
                          </span>
                        )}
                        {correction.canonical_domain && (
                          <span className="text-[11px] text-muted-foreground">
                            {correction.canonical_domain}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(correction.created_at)}
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
                          href={`/api/admin/explicit-corrections?profile_id=${correction.profile_id ?? ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          View
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Promote confirmation dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={(open) => {
        if (!isPromoting) {
          setPromoteDialogOpen(open);
          if (!open) setPromoteResult(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Promote Corrections to Profile Version</DialogTitle>
            <DialogDescription>
              Create a draft Profile Version from {selectedIds.size} selected correction{selectedIds.size === 1 ? '' : 's'}.
              {promoteResult ? '' : ' The version will be created as a draft and can be validated before approval.'}
            </DialogDescription>
          </DialogHeader>

          {promoteResult ? (
            /* Success state */
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                <p className="text-sm font-medium text-success">Profile version created</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version ID: {(promoteResult.version as Record<string, unknown> | undefined)?.id as string ?? 'unknown'}
                  {' · '}
                  Profile ID: {promoteResult.version ? (promoteResult.version as Record<string, unknown>).profile_id as string : 'unknown'}
                </p>
              </div>
              {promoteResult.validateJob && (
                <div className="rounded-lg border border-muted bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Validation job enqueued
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Job ID: {(promoteResult.validateJob as Record<string, unknown>).id as string}
                    {' · '}
                    Status: {(promoteResult.validateJob as Record<string, unknown>).status as string}
                  </p>
                </div>
              )}
            </div>
          ) : promoteError ? (
            /* Error state */
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Promotion failed</p>
              <p className="mt-1 text-xs text-muted-foreground">{promoteError}</p>
            </div>
          ) : (
            /* Confirmation state — show scope summary */
            <div className="space-y-2 py-2">
              {Array.from(scopeGroups.entries())
                .filter(([_, list]) => list.some((c) => selectedIds.has(c.id)))
                .map(([key, list]) => {
                  const selectedInScope = list.filter((c) => selectedIds.has(c.id));
                  const [brandId, sourceSlug, canonicalDomain] = key.split('::');
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-border bg-muted/10 p-3 text-xs"
                    >
                      <p className="font-medium text-foreground">
                        {sourceSlug} / {canonicalDomain}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {selectedInScope.length} correction{selectedInScope.length === 1 ? '' : 's'}
                        {' · '}
                        Fields:{' '}
                        {[...new Set(selectedInScope.map((c) => c.target_field))].sort().join(', ')}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}

          <DialogFooter>
            {promoteResult ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setPromoteDialogOpen(false);
                  setPromoteResult(null);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPromoteDialogOpen(false)}
                  disabled={isPromoting}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePromote}
                  disabled={isPromoting}
                >
                  {isPromoting ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Promoting...
                    </>
                  ) : (
                    <>
                      <BookMarked className="mr-1 h-3.5 w-3.5" />
                      Confirm Promote
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
