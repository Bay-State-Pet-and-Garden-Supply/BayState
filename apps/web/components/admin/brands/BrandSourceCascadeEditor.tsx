'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Loader2,
  Save,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FIXED_DISTRIBUTOR_CATALOG } from '@/lib/approved-sources/distributor-catalog';
import type { FixedDistributorEntry } from '@/lib/approved-sources/distributor-catalog';

// =============================================================================
// Types
// =============================================================================

interface CascadeEntry {
  sourceSlug: string;
  displayName: string;
  domains: string[];
  requiresAuth: boolean;
  adapterSlug: string;
  searchMode: string;
  priority: number;
  enabled: boolean;
  id?: string;
}

interface EditorEntry {
  sourceSlug: string;
  displayName: string;
  domains: string[];
  requiresAuth: boolean;
  adapterSlug: string;
  searchMode: string;
  priority: number;
  enabled: boolean;
  id?: string;
}

interface CascadeState {
  configured: boolean;
  configuredAt: string | null;
  configuredBy: string | null;
  entries: CascadeEntry[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build the initial editor entries from the catalog.
 * Merges any existing DB entries (with enabled/priority from DB) and fills
 * in missing entries from the catalog with defaults.
 */
function buildInitialEntries(
  dbEntries: CascadeEntry[],
): EditorEntry[] {
  const dbBySlug = new Map<string, CascadeEntry>();
  for (const e of dbEntries) {
    dbBySlug.set(e.sourceSlug, e);
  }

  // Build ordered list: DB entries first (preserving saved order), then new catalog entries at the end
  const seen = new Set<string>();
  const merged: EditorEntry[] = [];

  for (const db of dbEntries) {
    const catalog = FIXED_DISTRIBUTOR_CATALOG.find((c) => c.sourceSlug === db.sourceSlug);
    merged.push({
      sourceSlug: db.sourceSlug,
      displayName: catalog?.displayName ?? db.displayName,
      domains: catalog?.domains ?? db.domains,
      requiresAuth: catalog?.requiresAuth ?? db.requiresAuth,
      adapterSlug: catalog?.adapterSlug ?? db.adapterSlug,
      searchMode: catalog?.searchMode ?? db.searchMode,
      priority: db.priority,
      enabled: db.enabled,
      id: db.id,
    });
    seen.add(db.sourceSlug);
  }

  // Append catalog entries not yet in DB (enabled=false by default)
  for (const catalog of FIXED_DISTRIBUTOR_CATALOG) {
    if (!seen.has(catalog.sourceSlug)) {
      merged.push({
        sourceSlug: catalog.sourceSlug,
        displayName: catalog.displayName,
        domains: catalog.domains,
        requiresAuth: catalog.requiresAuth,
        adapterSlug: catalog.adapterSlug,
        searchMode: catalog.searchMode,
        priority: (merged.length + 1) * 10,
        enabled: false,
      });
    }
  }

  return merged;
}

// =============================================================================
// Component
// =============================================================================

interface BrandSourceCascadeEditorProps {
  brandId: string;
  brandSlug: string;
}

export function BrandSourceCascadeEditor({
  brandId,
  brandSlug,
}: BrandSourceCascadeEditorProps) {
  const [entries, setEntries] = useState<EditorEntry[]>([]);
  const [configured, setConfigured] = useState(false);
  const [configuredAt, setConfiguredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load cascade data
  const loadCascade = useCallback(async () => {
    const res = await fetch(
      `/api/admin/brands/${encodeURIComponent(brandId)}/source-cascade`,
    );
    if (!res.ok) {
      throw new Error(`Failed to load cascade: ${res.statusText}`);
    }
    return (await res.json()) as CascadeState;
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    loadCascade()
      .then((data) => {
        if (cancelled) return;
        setConfigured(data.configured);
        setConfiguredAt(data.configuredAt);
        setEntries(buildInitialEntries(data.entries));
        setHasChanges(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : 'Failed to load cascade');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [brandId, loadCascade]);

  // Mark dirty on any change
  const markDirty = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Move entry up
  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      setEntries((prev) => {
        const next = [...prev];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  // Move entry down
  const moveDown = useCallback(
    (index: number) => {
      setEntries((prev) => {
        if (index >= prev.length - 1) return prev;
        const next = [...prev];
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  // Move to top
  const moveToTop = useCallback(
    (index: number) => {
      if (index <= 0) return;
      setEntries((prev) => {
        const next = [...prev];
        const [item] = next.splice(index, 1);
        next.unshift(item);
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  // Move to bottom
  const moveToBottom = useCallback(
    (index: number) => {
      setEntries((prev) => {
        if (index >= prev.length - 1) return prev;
        const next = [...prev];
        const [item] = next.splice(index, 1);
        next.push(item);
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  // Toggle enabled
  const toggleEnabled = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], enabled: !next[index].enabled };
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      // Slight opacity on drag
      (e.currentTarget as HTMLElement).style.opacity = '0.5';
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [],
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).style.opacity = '1';
      setDragIndex(null);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).style.opacity = '1';
      const fromIdx = dragIndex;
      if (fromIdx === null || fromIdx === dropIndex) {
        setDragIndex(null);
        return;
      }

      setEntries((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(dropIndex, 0, moved);
        return next;
      });
      setDragIndex(null);
      markDirty();
    },
    [dragIndex, markDirty],
  );

  // Save cascade
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Assign priorities based on position (0-based index * 10)
      const payload = entries.map((e, idx) => ({
        sourceSlug: e.sourceSlug,
        enabled: e.enabled,
        priority: (idx + 1) * 10,
      }));

      const res = await fetch(
        `/api/admin/brands/${encodeURIComponent(brandId)}/source-cascade`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: payload }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error ?? 'Failed to save cascade');
      }

      const data: CascadeState = await res.json();
      setConfigured(data.configured);
      setConfiguredAt(data.configuredAt);
      setEntries(buildInitialEntries(data.entries));
      setHasChanges(false);
      toast.success('Source cascade saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save cascade';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [brandId, entries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading source cascade...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {configured ? (
            <>
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700">
                Cascade configured
                {configuredAt
                  ? ` — ${new Date(configuredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`
                  : ''}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600">
                Cascade not configured — extraction blocked
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadCascade}
            disabled={saving}
            className="rounded-none border-2 border-border h-7 text-xs"
          >
            <X className="mr-1 h-3 w-3" />
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="rounded-none h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {saving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            Save Cascade
          </Button>
        </div>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No distributors available for this brand.
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry, index) => {
            const catalogEntry = FIXED_DISTRIBUTOR_CATALOG.find(
              (c: FixedDistributorEntry) => c.sourceSlug === entry.sourceSlug,
            );
            return (
              <div
                key={entry.sourceSlug}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, index)}
                className={`
                  flex items-center gap-2 px-3 py-2 border-2 border-border bg-card
                  ${dragIndex === index ? 'opacity-50' : 'opacity-100'}
                  ${!entry.enabled ? 'opacity-60' : ''}
                  hover:bg-muted/50 cursor-default transition-colors
                `}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0">
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Position indicator */}
                <span className="w-5 text-[10px] font-mono text-muted-foreground text-right flex-shrink-0">
                  {index + 1}
                </span>

                {/* Enable/disable toggle */}
                <div className="flex-shrink-0">
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={() => toggleEnabled(index)}
                    className="scale-75 data-[state=checked]:bg-primary"
                  />
                </div>

                {/* Source info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {catalogEntry?.displayName ?? entry.displayName}
                    </span>
                    {entry.requiresAuth && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 border border-amber-200 flex-shrink-0">
                        Auth
                      </span>
                    )}
                  </div>
                  {entry.domains && entry.domains.length > 0 && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {entry.domains.join(', ')}
                    </p>
                  )}
                </div>

                {/* Move buttons */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveToTop(index)}
                    disabled={index === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move to top"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3 -mt-0.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === entries.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveToBottom(index)}
                    disabled={index === entries.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move to bottom"
                  >
                    <ChevronDown className="h-3 w-3 -mb-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Help text */}
      {hasChanges && (
        <p className="text-[10px] font-medium text-amber-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Unsaved changes — click Save Cascade to persist
        </p>
      )}
    </div>
  );
}
