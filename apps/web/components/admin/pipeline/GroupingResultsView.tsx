'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adminFetch } from '@/lib/admin/api-client';
import { toast } from 'sonner';
import {
  Boxes,
  Search,
  Plus,
  Check,
  X,
  Loader2,
  ChevronRight,
  Sparkles,
  Info,
  Trash2,
  FolderSync,
  HelpCircle,
  FolderOpen,
  ArrowRight,
  ExternalLink,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import GroupingProductTile, { type ProductPreview } from './grouping/GroupingProductTile';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProductInfo {
  upc: string;
  input: any;
  preview?: ProductPreview | null;
  product_line_confidence: number | null;
  product_line_assignment_source: 'ai' | 'manual' | 'migration' | null;
  product_line_review_required: boolean;
}

interface GroupData {
  product_line_id: string;
  product_line_name: string;
  products: ProductInfo[];
  review_required_count: number;
  ready: boolean;
  review_required_products: string[];
}

interface UngroupedData {
  upc: string;
  input: any;
  accepted: boolean;
  preview?: ProductPreview | null;
  product_line_confidence: number | null;
  product_line_raw_label: string | null;
  product_line_review_required: boolean;
  product_line_assignment_source: 'ai' | 'manual' | 'migration' | null;
}

interface GroupingData {
  groups: GroupData[];
  ungrouped: UngroupedData[];
  ready_group_count: number;
  needs_review_group_count: number;
  accepted_singleton_count: number;
  needs_review_singleton_count: number;
  total_grouped: number;
  total_ungrouped: number;
}

interface GroupingResultsViewProps {
  onConsolidateGroups?: any;
  onStageChange?: (stage: string) => void;
}

export default function GroupingResultsView({ onStageChange, onConsolidateGroups }: GroupingResultsViewProps) {
  // Core state
  const [data, setData] = useState<GroupingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Left column state
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'ungrouped' | null>(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Middle column state
  const [productSearch, setProductSearch] = useState('');
  const [selectedUpcs, setSelectedUpcs] = useState<Set<string>>(new Set());

  // Right column editing state
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitName, setSplitName] = useState('');

  // Consolidation state
  const [consolidating, setConsolidating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [complete, setComplete] = useState(false);
  const [consolidationError, setConsolidationError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch groups and ungrouped products
  const refreshData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/admin/grouping/groups');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to fetch product groups');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Execute API PATCH calls on a group
  const callAction = async (productLineId: string | 'ungrouped', body: any, successMessage?: string) => {
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/grouping/groups/${productLineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resJson = await res.json();
      if (res.ok) {
        toast.success(successMessage || 'Operation completed successfully');
        await refreshData(true);
        setSelectedUpcs(new Set());
      } else {
        toast.error(resJson.error || 'Operation failed');
      }
    } catch {
      toast.error('Network error during operation');
    } finally {
      setActionLoading(false);
    }
  };

  // Find active group details
  const activeGroup = useMemo(() => {
    if (!data || !selectedGroupId || selectedGroupId === 'ungrouped') return null;
    return data.groups.find(g => g.product_line_id === selectedGroupId) || null;
  }, [data, selectedGroupId]);

  // Filter groups for sidebar
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    let list = data.groups;
    if (needsReviewOnly) {
      list = list.filter(g => !g.ready);
    }
    if (groupSearch.trim()) {
      const searchLower = groupSearch.toLowerCase();
      list = list.filter(g => g.product_line_name.toLowerCase().includes(searchLower));
    }
    return list;
  }, [data, groupSearch, needsReviewOnly]);

  // Filter products for middle column pool (strictly ungrouped/unassigned products)
  const filteredPoolProducts = useMemo(() => {
    if (!data) return [];
    let list: Array<ProductInfo & { type: 'grouped' | 'ungrouped'; current_group_name?: string }> = [];

    // Add ungrouped items
    data.ungrouped.forEach(u => {
      list.push({
        upc: u.upc,
        input: u.input,
        preview: u.preview,
        product_line_confidence: u.product_line_confidence,
        product_line_assignment_source: u.product_line_assignment_source,
        product_line_review_required: u.product_line_review_required,
        type: 'ungrouped'
      });
    });

    // Apply review-only filter
    if (needsReviewOnly) {
      list = list.filter(p => p.product_line_review_required === true);
    }

    // Apply search filter
    if (productSearch.trim()) {
      const s = productSearch.toLowerCase();
      list = list.filter(p => 
        p.upc.includes(s) || 
        p.preview?.name?.toLowerCase().includes(s) ||
        p.preview?.source_product_name?.toLowerCase().includes(s) ||
        p.preview?.brand?.toLowerCase().includes(s)
      );
    }

    return list;
  }, [data, productSearch, needsReviewOnly]);

  // Inline group creation (Splits checked items into a new group)
  const handleCreateGroupInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    if (selectedUpcs.size === 0) {
      toast.error('Please check at least one product in the list to move to the new group');
      return;
    }
    const firstUpc = Array.from(selectedUpcs)[0];
    await callAction(
      firstUpc,
      {
        action: 'split',
        upcs: Array.from(selectedUpcs),
        new_product_line_name: newGroupName.trim(),
      },
      `Created new group "${newGroupName}" with ${selectedUpcs.size} products`
    );
    setNewGroupName('');
  };

  // One-click assign to active group
  const handleAssignToActiveGroup = async (upc: string) => {
    if (!selectedGroupId || selectedGroupId === 'ungrouped') {
      toast.error('Please select a target group from the left sidebar first');
      return;
    }
    await callAction(
      selectedGroupId,
      { action: 'reassign', upcs: [upc] },
      `Assigned product to ${activeGroup?.product_line_name}`
    );
  };

  // One-click ungroup (remove from group)
  const handleUngroup = async (upc: string) => {
    await callAction(
      'ungrouped',
      { action: 'ungroup', upcs: [upc] },
      'Product ungrouped successfully'
    );
  };

  // Bulk assign checked items to active group
  const handleBulkAssign = async () => {
    if (!selectedGroupId || selectedGroupId === 'ungrouped') return;
    await callAction(
      selectedGroupId,
      { action: 'reassign', upcs: Array.from(selectedUpcs) },
      `Assigned ${selectedUpcs.size} products to group`
    );
  };

  // Bulk ungroup checked items
  const handleBulkUngroup = async () => {
    await callAction(
      'ungrouped',
      { action: 'ungroup', upcs: Array.from(selectedUpcs) },
      `Ungrouped ${selectedUpcs.size} products`
    );
  };

  // One-click accept singleton (approve ungrouped product)
  const handleAcceptSingleton = async (upc: string) => {
    await callAction(
      'ungrouped',
      { action: 'accept_singleton', upcs: [upc] },
      'Accepted singleton product'
    );
  };

  // Bulk accept singletons
  const handleBulkAcceptSingletons = async () => {
    await callAction(
      'ungrouped',
      { action: 'accept_singleton', upcs: Array.from(selectedUpcs) },
      `Accepted ${selectedUpcs.size} singletons`
    );
  };

  // Rename group canonical name
  const handleRenameGroup = async () => {
    if (!selectedGroupId || selectedGroupId === 'ungrouped' || !renameValue.trim()) return;
    await callAction(
      selectedGroupId,
      { action: 'rename', new_name: renameValue.trim() },
      'Group renamed successfully'
    );
    setRenameTargetId(null);
  };

  // Merge selected active group into another group
  const handleMergeGroups = async () => {
    if (!selectedGroupId || selectedGroupId === 'ungrouped' || !mergeTargetId) return;
    const targetName = data?.groups.find(g => g.product_line_id === mergeTargetId)?.product_line_name || 'selected group';
    await callAction(
      selectedGroupId,
      { action: 'merge', target_product_line_id: mergeTargetId },
      `Merged successfully into "${targetName}"`
    );
    setIsMerging(false);
    setMergeTargetId('');
    setSelectedGroupId(mergeTargetId);
  };

  // Split selected products in current group into a new group
  const handleSplitGroup = async () => {
    if (selectedUpcs.size === 0 || !splitName.trim()) return;
    const firstUpc = Array.from(selectedUpcs)[0];
    await callAction(
      firstUpc,
      {
        action: 'split',
        upcs: Array.from(selectedUpcs),
        new_product_line_name: splitName.trim(),
      },
      `Split ${selectedUpcs.size} products into new group "${splitName}"`
    );
    setIsSplitting(false);
    setSplitName('');
  };

  // Approve active group
  const handleApproveGroup = async () => {
    if (!selectedGroupId || selectedGroupId === 'ungrouped') return;
    await callAction(
      selectedGroupId,
      { action: 'approve' },
      'Group approved successfully'
    );
  };

  // Select all products visible in the middle panel
  const toggleSelectAllPool = () => {
    const allSelected = filteredPoolProducts.every(p => selectedUpcs.has(p.upc));
    const nextSet = new Set(selectedUpcs);
    if (allSelected) {
      filteredPoolProducts.forEach(p => nextSet.delete(p.upc));
    } else {
      filteredPoolProducts.forEach(p => nextSet.add(p.upc));
    }
    setSelectedUpcs(nextSet);
  };

  // Select/toggle one item
  const toggleSelection = (upc: string) => {
    setSelectedUpcs(prev => {
      const next = new Set(prev);
      if (next.has(upc)) next.delete(upc);
      else next.add(upc);
      return next;
    });
  };

  // Consolidation Submit & Progress Polling
  const pollProgress = useCallback(async (bId: string) => {
    try {
      const res = await adminFetch(`/api/admin/grouping/consolidate/${bId}`);
      if (res.ok) {
        const progressJson = await res.json();
        if (progressJson.is_complete) {
          setProgress({ completed: progressJson.total, total: progressJson.total });
          setComplete(true);
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setProgress({
            completed: progressJson.completed_requests || 0,
            total: progressJson.total_requests || 0,
          });
        }
      }
    } catch {
      // silent retry on next interval
    }
  }, []);

  const handleStartConsolidation = async () => {
    if (!data) return;
    
    // Derived values
    const readyGroups = data.groups.filter(g => g.ready);
    const acceptedSingletons = data.ungrouped.filter(u => u.accepted);
    const readyGroupIds = readyGroups.map(g => g.product_line_id);
    const singletonUpcs = acceptedSingletons.map(s => s.upc);
    const totalProducts = readyGroups.reduce((sum, g) => sum + g.products.length, 0) + singletonUpcs.length;

    if (totalProducts === 0) {
      toast.error('There are no approved groups or accepted singletons to consolidate.');
      return;
    }

    setConsolidating(true);
    setConsolidationError(null);

    try {
      const res = await adminFetch('/api/admin/grouping/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_line_ids: readyGroupIds,
          singleton_upcs: singletonUpcs,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        setConsolidationError(resJson.error || 'Failed to start consolidation');
        setConsolidating(false);
        return;
      }

      setProgress({ completed: 0, total: totalProducts });
      pollRef.current = setInterval(() => pollProgress(resJson.batch_id), 2500);
    } catch {
      setConsolidationError('Network error during consolidation start');
      setConsolidating(false);
    }
  };

  const handleViewMerging = () => {
    if (onStageChange) onStageChange('merging');
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-background/50">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-sm font-semibold text-muted-foreground">Loading pipeline product groups...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center max-w-md mx-auto">
        <div className="p-4 rounded-full bg-destructive/10 border border-destructive/20 text-destructive mb-4">
          <Info className="h-8 w-8" />
        </div>
        <h3 className="font-bold text-lg mb-1">Failed to load groups</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button onClick={() => refreshData()} className="px-4 py-2 border rounded-xl hover:bg-muted font-medium transition-all">
          Try Again
        </button>
      </div>
    );
  }

  // Statistics summaries
  const needsReviewCount = (data?.needs_review_group_count || 0) + (data?.needs_review_singleton_count || 0);
  const readyGroups = data?.groups.filter(g => g.ready) || [];
  const acceptedSingletons = data?.ungrouped.filter(u => u.accepted) || [];
  const totalReadyProducts = readyGroups.reduce((sum, g) => sum + g.products.length, 0) + acceptedSingletons.length;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-0 bg-background overflow-hidden relative">
      {/* Workspace Header Toolbar */}
      <div className="flex items-center justify-between border-b border-border/85 px-4 py-3 bg-muted/5 flex-shrink-0 flex-wrap gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-foreground">Ingestion Grouping Workspace</h1>
            {needsReviewCount > 0 && (
              <Badge variant="outline" className="border-amber-500/20 text-amber-500 bg-amber-500/5 font-semibold">
                ⚠ {needsReviewCount} needs review
              </Badge>
            )}
            <Badge variant="outline" className="border-emerald-500/20 text-emerald-500 bg-emerald-500/5 font-semibold">
              ✓ {totalReadyProducts} products ready
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-normal">
            Verify AI grouping results, reassign variants, and approve groups before sending to consolidation.
          </p>
        </div>

        {/* Global Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartConsolidation}
            disabled={totalReadyProducts === 0 || consolidating}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 text-sm font-semibold shadow-md disabled:opacity-50 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <FolderSync className="h-4 w-4" />
            Consolidate Approved ({totalReadyProducts})
          </button>
        </div>
      </div>

      {/* 3-Column Split Workspace */}
      <div className="flex-1 flex min-h-0 lg:flex-row flex-col overflow-hidden relative">
        {/* COLUMN 1: Groups List (Left) */}
        <div className="flex flex-col border-b border-border/80 lg:border-b-0 lg:border-r border-border/80 lg:w-[320px] w-full min-h-0 bg-muted/10">
          <div className="p-3 border-b border-border/50 space-y-2 shrink-0">
            {/* Inline Creation Input */}
            <form onSubmit={handleCreateGroupInline} className="space-y-1">
              <Label htmlFor="inline-group-create" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Create new group from checked
              </Label>
              <div className="relative">
                <Plus className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="inline-group-create"
                  placeholder="Type new group name + Enter..."
                  className="pl-8 text-xs rounded-xl bg-background/80 h-9"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
            </form>

            {/* Filters row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search groups..."
                  className="pl-8 text-xs rounded-xl bg-background/80 h-8"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                />
              </div>
            </div>
            
            {/* Needs Review Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground py-0.5 hover:text-foreground transition-all">
              <input
                type="checkbox"
                checked={needsReviewOnly}
                onChange={(e) => setNeedsReviewOnly(e.target.checked)}
                className="rounded border-border cursor-pointer text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span className="font-semibold">Filter: Needs Review Only</span>
            </label>
          </div>

          {/* Groups Scroll List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Special: Ungrouped products virtual folder */}
            <button
              onClick={() => { setSelectedGroupId('ungrouped'); setSelectedUpcs(new Set()); }}
              className={`w-full flex flex-col gap-1 p-3 text-left rounded-xl border transition-all duration-200 ${
                selectedGroupId === 'ungrouped'
                  ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-muted/40 text-foreground'
              }`}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="font-bold text-sm flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4" />
                  Ungrouped Products
                </span>
                <Badge variant="outline" className={`shrink-0 ${selectedGroupId === 'ungrouped' ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
                  {data?.total_ungrouped || 0}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {(data?.needs_review_singleton_count || 0)} singletons still need review
              </p>
            </button>

            <div className="border-t border-border/50 my-1 py-1" />

            {/* List of active groups */}
            {filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Boxes className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground font-semibold">No groups found</p>
              </div>
            ) : (
              filteredGroups.map((g) => {
                const isSelected = g.product_line_id === selectedGroupId;
                return (
                  <button
                    key={g.product_line_id}
                    onClick={() => { setSelectedGroupId(g.product_line_id); setSelectedUpcs(new Set()); }}
                    className={`w-full flex flex-col gap-1 p-3 text-left rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                        : g.ready
                        ? 'bg-transparent border-transparent hover:bg-muted/40 text-foreground'
                        : 'border-amber-500/10 hover:border-amber-500/25 bg-amber-500/[0.01] hover:bg-amber-500/[0.03] text-foreground'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="font-semibold text-sm line-clamp-1 flex-1">
                        {g.product_line_name}
                      </span>
                      <Badge variant="outline" className={`shrink-0 ${isSelected ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
                        {g.products.length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate text-muted-foreground/80 font-mono text-[9px] uppercase">ID: {g.product_line_id.substring(0, 8)}...</span>
                      {!g.ready && (
                        <span className="text-amber-600 font-bold shrink-0">⚠ Flagged</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: Ingestion Product Pool (Middle) */}
        <div className="flex-1 flex flex-col border-b border-border/80 lg:border-b-0 lg:border-r border-border/80 min-h-0 bg-muted/[0.02]">
          <div className="p-3 border-b border-border/50 space-y-3 shrink-0">
            {/* Search pool controls */}
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search Pool by name, brand, or UPC..."
                className="pl-8 text-xs rounded-xl bg-background w-full"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            {/* Bulk pool actions bar */}
            {selectedUpcs.size > 0 && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-primary/10 border border-primary/20 shrink-0 text-xs animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="font-bold text-primary">
                    {selectedUpcs.size} selected
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedGroupId && selectedGroupId !== 'ungrouped' && (
                    <button
                      onClick={handleBulkAssign}
                      disabled={actionLoading}
                      className="px-2.5 py-1 text-[11px] bg-primary text-primary-foreground font-semibold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      Assign to Group
                    </button>
                  )}
                  <button
                    onClick={handleBulkAcceptSingletons}
                    disabled={actionLoading}
                    className="px-2.5 py-1 text-[11px] bg-emerald-100 text-emerald-700 font-semibold rounded-lg hover:bg-emerald-200 disabled:opacity-50 cursor-pointer"
                  >
                    Accept Singletons
                  </button>
                  <button
                    onClick={() => setSelectedUpcs(new Set())}
                    className="px-2 py-1 border rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable list of products */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredPoolProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Info className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground font-bold">No pool products match criteria</p>
                <p className="text-xs text-muted-foreground/85 max-w-xs mt-1">
                  Adjust status filters or search term to discover products.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                {filteredPoolProducts.map((p) => {
                  const isChecked = selectedUpcs.has(p.upc);

                  return (
                    <div
                      key={p.upc}
                      className={`relative rounded-xl border transition-all duration-200 ${
                        isChecked ? 'ring-2 ring-primary border-primary/20' : ''
                      }`}
                    >
                      <GroupingProductTile
                        upc={p.upc}
                        preview={p.preview}
                        confidence={p.product_line_confidence}
                        assignmentSource={p.product_line_assignment_source}
                        reviewRequired={p.product_line_review_required}
                        compact
                      >
                        <div className="flex flex-col items-end gap-2 h-full justify-between py-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelection(p.upc)}
                            className="rounded border-border cursor-pointer text-primary focus:ring-primary h-4 w-4"
                          />
                          
                          <div className="flex gap-1">
                            {p.product_line_review_required && (
                              <button
                                onClick={() => handleAcceptSingleton(p.upc)}
                                disabled={actionLoading}
                                className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 font-semibold rounded-lg hover:bg-emerald-200 disabled:opacity-50 cursor-pointer"
                              >
                                Accept Singleton
                              </button>
                            )}
                            
                            {selectedGroupId && selectedGroupId !== 'ungrouped' && (
                              <button
                                onClick={() => handleAssignToActiveGroup(p.upc)}
                                disabled={actionLoading}
                                className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 disabled:opacity-50 cursor-pointer flex items-center gap-0.5"
                              >
                                ⇌ Assign
                              </button>
                            )}
                          </div>
                        </div>
                      </GroupingProductTile>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 3: Active Group details & members list (Right) */}
        <div className="lg:w-[380px] w-full flex flex-col min-h-0 bg-background">
          {!selectedGroupId || selectedGroupId === 'ungrouped' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-background to-muted/10">
              <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-bold text-sm text-foreground">No Group Selected</h3>
              <p className="text-xs text-muted-foreground max-w-[200px] mt-1 leading-relaxed">
                Select a product group from the sidebar to edit details, merge lines, or split active members.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Group Metadata Details */}
              <div className="p-4 border-b border-border/80 bg-muted/5 space-y-4 shrink-0">
                <div className="space-y-1">
                  {/* Inline group renaming */}
                  {renameTargetId === activeGroup?.product_line_id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameGroup();
                          if (e.key === 'Escape') setRenameTargetId(null);
                        }}
                        className="text-sm font-semibold h-8 rounded-xl"
                        autoFocus
                      />
                      <button onClick={handleRenameGroup} className="p-1 text-primary hover:bg-muted rounded-lg">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setRenameTargetId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded-lg">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <h2
                        className="font-bold text-base text-foreground cursor-pointer hover:text-primary leading-tight line-clamp-2"
                        onClick={() => {
                          setRenameTargetId(activeGroup!.product_line_id);
                          setRenameValue(activeGroup!.product_line_name);
                        }}
                        title="Click to rename"
                      >
                        {activeGroup?.product_line_name}
                      </h2>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      ID: {activeGroup?.product_line_id.substring(0, 12)}...
                    </span>
                    {activeGroup?.ready ? (
                      <Badge variant="outline" className="border-emerald-500/20 text-emerald-500 bg-emerald-500/5 text-[9px] py-0 px-1.5 font-bold uppercase">
                        Ready
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/20 text-amber-500 bg-amber-500/5 text-[9px] py-0 px-1.5 font-bold uppercase">
                        Needs Review
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Group Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {!activeGroup?.ready && (
                    <button
                      onClick={handleApproveGroup}
                      disabled={actionLoading}
                      className="px-2.5 py-1.5 bg-emerald-600 text-white font-semibold rounded-xl text-xs hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shadow-sm text-center flex items-center justify-center gap-1"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve Group
                    </button>
                  )}
                  
                  <button
                    onClick={() => setIsMerging(true)}
                    disabled={actionLoading}
                    className="px-2.5 py-1.5 border border-orange-500/20 hover:border-orange-500/40 text-orange-600 font-semibold rounded-xl text-xs hover:bg-orange-500/5 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center gap-1"
                  >
                    <FolderSync className="h-3.5 w-3.5" />
                    Merge Into...
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('Ungroup all products in this group?')) {
                        const upcs = activeGroup?.products.map(p => p.upc) || [];
                        callAction('ungrouped', { action: 'ungroup', upcs }, 'Group dissolved successfully');
                      }
                    }}
                    disabled={actionLoading}
                    className="px-2.5 py-1.5 border border-destructive/20 hover:border-destructive/40 text-destructive font-semibold rounded-xl text-xs hover:bg-destructive/5 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Dissolve Group
                  </button>
                </div>
              </div>

              {/* Members selection action bar */}
              {selectedUpcs.size > 0 && activeGroup?.products.some(p => selectedUpcs.has(p.upc)) && (
                <div className="px-4 py-2 border-b border-border/80 bg-purple-50 text-xs flex justify-between items-center shrink-0">
                  <span className="font-bold text-purple-700">{selectedUpcs.size} checked in group</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setIsSplitting(true)}
                      className="px-2 py-1 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 cursor-pointer"
                    >
                      Split into New...
                    </button>
                    <button
                      onClick={handleBulkUngroup}
                      className="px-2 py-1 border border-purple-200 bg-white text-purple-700 font-semibold rounded-lg hover:bg-purple-50 cursor-pointer"
                    >
                      Ungroup
                    </button>
                  </div>
                </div>
              )}

              {/* Group members list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                  Active Group Members ({activeGroup?.products.length || 0})
                </div>
                
                {activeGroup?.products.map((p) => {
                  const isChecked = selectedUpcs.has(p.upc);
                  return (
                    <div
                      key={p.upc}
                      className={`relative flex items-center gap-3 p-2 rounded-xl border bg-background transition-all duration-200 ${
                        isChecked ? 'border-primary bg-primary/[0.01]' : 'border-border/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelection(p.upc)}
                        className="rounded border-border cursor-pointer text-primary focus:ring-primary h-4.5 w-4.5 shrink-0"
                      />

                      {/* Mini Thumbnail */}
                      <div className="h-10 w-10 rounded-lg bg-muted border border-border/50 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {p.preview?.image_url ? (
                          <img src={p.preview.image_url} alt={p.upc} className="h-full w-full object-cover" />
                        ) : (
                          <Boxes className="h-4 w-4 text-muted-foreground/30" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5 text-xs">
                        <div className="font-semibold text-foreground line-clamp-1 leading-tight">
                          {p.preview?.name || 'No Name'}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[9px]">
                          <span>{p.upc}</span>
                          <span>•</span>
                          <span className="capitalize text-emerald-500 font-medium">Confidence: {p.product_line_confidence != null ? `${(p.product_line_confidence * 100).toFixed(0)}%` : '-'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleUngroup(p.upc)}
                        disabled={actionLoading}
                        className="p-1 rounded-lg text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                        title="Remove from group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Merge Group Dialog */}
      {isMerging && activeGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border/85 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-foreground">Merge Group</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Collapse "{activeGroup.product_line_name}" and move all products into another existing group.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="merge-target-select" className="text-xs font-semibold">Select Target Group</Label>
              <select
                id="merge-target-select"
                value={mergeTargetId}
                onChange={e => setMergeTargetId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 hover:border-border cursor-pointer transition-all"
              >
                <option value="">Choose target...</option>
                {data?.groups
                  .filter(g => g.product_line_id !== selectedGroupId)
                  .map(g => (
                    <option key={g.product_line_id} value={g.product_line_id}>
                      {g.product_line_name} ({g.products.length} products)
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setIsMerging(false); setMergeTargetId(''); }}
                className="px-4 py-2 text-xs border rounded-xl hover:bg-muted font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleMergeGroups}
                disabled={!mergeTargetId || actionLoading}
                className="px-4 py-2 text-xs bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                Merge Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Split Group Dialog */}
      {isSplitting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border/85 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-lg text-foreground">Split Products into New Group</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedUpcs.size} checked products will be removed from their current line and moved to a brand new product group.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="split-name-input" className="text-xs font-semibold">New Product Line Name</Label>
              <Input
                id="split-name-input"
                placeholder="Type new canonical name..."
                className="rounded-xl h-10 bg-background"
                value={splitName}
                onChange={e => setSplitName(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setIsSplitting(false); setSplitName(''); }}
                className="px-4 py-2 text-xs border rounded-xl hover:bg-muted font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSplitGroup}
                disabled={!splitName.trim() || actionLoading}
                className="px-4 py-2 text-xs bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                Create & Split
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Consolidation Progress Overlay */}
      {consolidating && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border/85 rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-300">
            {!complete && !consolidationError && (
              <>
                <div className="flex justify-center">
                  <Loader2 className="h-12 w-12 text-purple-600 animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-foreground">Consolidating Product Groups</h3>
                  <p className="text-xs text-muted-foreground">
                    Sending approved product lines through enrichment pipelines. This may take a moment...
                  </p>
                </div>

                {progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground px-1">
                      <span>Processing items</span>
                      <span>{progress.completed} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-muted border border-border/60 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-purple-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {consolidationError && (
              <>
                <div className="flex justify-center text-rose-500">
                  <Info className="h-12 w-12" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-foreground">Consolidation Failed</h3>
                  <p className="text-xs text-rose-600">{consolidationError}</p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => { setConsolidating(false); setConsolidationError(null); }}
                    className="px-6 py-2 border rounded-xl hover:bg-muted font-medium text-xs cursor-pointer"
                  >
                    Close & Go Back
                  </button>
                </div>
              </>
            )}

            {complete && (
              <>
                <div className="flex justify-center text-emerald-500 animate-bounce">
                  <Check className="h-12 w-12 border-2 border-emerald-500 rounded-full p-1" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-foreground">Consolidation Complete!</h3>
                  <p className="text-xs text-muted-foreground">
                    AI enrichment completed. Product variants are now ready for review and publishing.
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    onClick={handleViewMerging}
                    className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 text-xs shadow-md cursor-pointer flex items-center gap-1"
                  >
                    View in Merging
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
