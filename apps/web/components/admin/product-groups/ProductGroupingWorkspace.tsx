'use client';

import React, { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Search,
  Plus,
  Star,
  Trash2,
  Settings,
  PlusCircle,
  X,
  Check,
  Loader2,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Info,
  FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface Brand {
  id: string;
  name: string;
}

interface ProductGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  brand_id: string | null;
  is_active: boolean;
  default_product_id: string | null;
  member_count?: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: any;
  stock_status: string;
  brand: { id: string; name: string } | null;
  group: {
    group_id: string;
    is_default: boolean;
    sort_order: number;
    group_name: string;
  } | null;
  sort_order?: number;
}

interface ProductGroupingWorkspaceProps {
  initialGroups: ProductGroup[];
  brands: Brand[];
  initialGroupId: string | null;
}

export function ProductGroupingWorkspace({
  initialGroups,
  brands,
  initialGroupId,
}: ProductGroupingWorkspaceProps) {
  const router = useRouter();

  // Workspace groups state
  const [groups, setGroups] = useState<ProductGroup[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId);
  const [groupSearch, setGroupSearch] = useState('');

  // Active group members state
  const [members, setMembers] = useState<Product[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Catalog search state
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'ungrouped' | 'in_group' | 'in_current_group'>('ungrouped');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Bulk actions state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Modals state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);

  // Inline group creation form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSlug, setNewGroupSlug] = useState('');
  const [newGroupBrandId, setNewGroupBrandId] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Selected group metadata form state
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editBrandId, setEditBrandId] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHeroUrl, setEditHeroUrl] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Find active group object
  const activeGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  // Sync edit form with active group
  useEffect(() => {
    if (activeGroup) {
      setEditName(activeGroup.name);
      setEditSlug(activeGroup.slug);
      setEditBrandId(activeGroup.brand_id || '');
      setEditDesc(activeGroup.description || '');
      setEditHeroUrl(activeGroup.hero_image_url || '');
      setEditIsActive(activeGroup.is_active);
    }
  }, [activeGroup]);

  // Load all groups from database
  const refreshGroups = async () => {
    try {
      const res = await fetch('/api/admin/product-groups');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups || []);
    } catch {
      toast.error('Failed to refresh groups list');
    }
  };

  // Load active group members
  const fetchMembers = useCallback(async (groupId: string) => {
    setIsLoadingMembers(true);
    try {
      const res = await fetch(`/api/admin/product-groups/products?status=in_current_group&group_id=${groupId}`);
      if (!res.ok) throw new Error('Failed to load group members');
      const data = await res.json();
      setMembers(data.products || []);
    } catch (err) {
      console.error(err);
      toast.error('Could not load group members');
    } finally {
      setIsLoadingMembers(false);
    }
  }, []);

  // Fetch group members when group selection changes
  useEffect(() => {
    if (selectedGroupId) {
      fetchMembers(selectedGroupId);
    } else {
      setMembers([]);
    }
  }, [selectedGroupId, fetchMembers]);

  // Load catalog products for assignment search
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      if (productSearch) params.set('search', productSearch);
      if (selectedBrandId) params.set('brand_id', selectedBrandId);
      params.set('status', selectedStatus);
      if (selectedGroupId) params.set('group_id', selectedGroupId);

      const res = await fetch(`/api/admin/product-groups/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to search products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error(err);
      toast.error('Could not search catalog products');
    } finally {
      setIsLoadingProducts(false);
    }
  }, [productSearch, selectedBrandId, selectedStatus, selectedGroupId]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, selectedBrandId, selectedStatus, selectedGroupId, fetchProducts]);

  // Filter groups in sidebar
  const filteredGroups = useMemo(() => {
    if (!groupSearch) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase()));
  }, [groups, groupSearch]);

  // Auto slug generation for new group
  useEffect(() => {
    const slug = newGroupName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setNewGroupSlug(slug);
  }, [newGroupName]);

  // Auto slug generation for edit group
  const handleNameChange = (val: string) => {
    setEditName(val);
    const slug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setEditSlug(slug);
  };

  // Group creation handler
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newGroupSlug.trim()) {
      toast.error('Please enter name and slug');
      return;
    }
    setIsSubmittingGroup(true);
    try {
      const res = await fetch('/api/admin/product-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          slug: newGroupSlug,
          brand_id: newGroupBrandId || null,
          description: newGroupDesc || null,
          is_active: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');

      toast.success('Product group created');
      setIsCreatingGroup(false);
      
      // Reset form fields
      setNewGroupName('');
      setNewGroupBrandId('');
      setNewGroupDesc('');

      // Refresh groups list and select new group
      await refreshGroups();
      setSelectedGroupId(data.group.id);
      router.push(`/admin/product-groups/${data.group.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Error creating group');
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  // Save selected group settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) return;
    setIsSavingSettings(true);
    try {
      const res = await fetch(`/api/admin/product-groups/${selectedGroupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          slug: editSlug,
          brand_id: editBrandId || null,
          description: editDesc || null,
          hero_image_url: editHeroUrl || null,
          is_active: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      toast.success('Group settings saved');
      await refreshGroups();
    } catch (err: any) {
      toast.error(err.message || 'Error saving settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Delete product group
  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;
    if (!confirm('Are you sure you want to delete this product group? The products in this group will not be deleted, but will become ungrouped.')) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/product-groups/${selectedGroupId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete group');

      toast.success('Product group deleted');
      setSelectedGroupId(null);
      router.push('/admin/product-groups');
      await refreshGroups();
    } catch {
      toast.error('Error deleting group');
    }
  };

  // Select Group handler
  const handleSelectGroup = (id: string) => {
    setSelectedGroupId(id);
    setSelectedProductIds(new Set());
    router.push(`/admin/product-groups/${id}`);
  };

  // Product Operations (Single & Bulk)
  const handleProductAction = async (
    action: 'add' | 'remove' | 'transfer',
    productId: string
  ) => {
    if (!selectedGroupId) return;
    try {
      const res = await fetch('/api/admin/product-groups/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          groupId: selectedGroupId,
          productId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Operation failed');
      }

      toast.success(
        action === 'add'
          ? 'Product added to group'
          : action === 'remove'
          ? 'Product removed from group'
          : 'Product transferred to group'
      );

      // Refresh members and catalog lists
      fetchMembers(selectedGroupId);
      fetchProducts();
      refreshGroups();
    } catch (err: any) {
      toast.error(err.message || 'Error modifying group products');
    }
  };

  // Make default product
  const handleSetDefault = async (productId: string) => {
    if (!selectedGroupId) return;
    try {
      const res = await fetch(`/api/admin/product-groups/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          groupId: selectedGroupId,
          productId,
        }),
      });

      // Wait, let's call the dedicated default server action or update directly
      // In product-group-actions: setGroupDefaultProduct updates both is_default and default_product_id.
      // Let's call the API which will trigger updating the default product.
      // Wait, let's look at setting default product via API. Currently POST API for `add` does setting default if group is empty.
      // But we need a direct action for "set_default".
      // Let's check: does the PATCH group API support updating default_product_id?
      // Yes! In patch product group schema: `default_product_id: z.string().uuid().optional().nullable()`.
      // Also we need to make sure product_group_products is_default is updated.
      // Wait, in `apps/web/app/api/admin/product-groups/[id]/route.ts` we have:
      // `default_product_id: z.string().uuid()` updates in `product_groups`.
      // To keep it simple and clean, let's write an API patch update, or implement a quick handler or use Server Actions.
      // Wait, can we call the server action `setGroupDefaultProduct` directly?
      // Yes! Next.js Server Actions can be imported and called inside Client Components!
      // Let's import `setGroupDefaultProduct` and call it:
      const { setGroupDefaultProduct } = await import('@/lib/admin/product-group-actions');
      await setGroupDefaultProduct(selectedGroupId, productId);

      toast.success('Default product updated');
      fetchMembers(selectedGroupId);
    } catch (err: any) {
      toast.error(err.message || 'Error updating default product');
    }
  };

  // Reorder Products: Move Up/Down
  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    if (!selectedGroupId || members.length <= 1) return;
    const newMembers = [...members];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= members.length) return;

    // Swap
    const temp = newMembers[index];
    newMembers[index] = newMembers[targetIdx];
    newMembers[targetIdx] = temp;

    // Set temporary order values
    const orders = newMembers.map((m, idx) => ({
      productId: m.id,
      sortOrder: idx * 10,
    }));

    // Optimistically update client state
    setMembers(newMembers);

    try {
      const res = await fetch('/api/admin/product-groups/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          groupId: selectedGroupId,
          orders,
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to save product sort order');
      // Rollback
      fetchMembers(selectedGroupId);
    }
  };

  // Bulk operation triggers
  const handleBulkAction = async (action: 'bulk_add' | 'bulk_transfer' | 'bulk_remove') => {
    if (!selectedGroupId || selectedProductIds.size === 0) return;
    const productIds = Array.from(selectedProductIds);
    setIsLoadingProducts(true);
    try {
      const res = await fetch('/api/admin/product-groups/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          groupId: selectedGroupId,
          productIds,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Bulk operation failed');
      }

      toast.success(`Successfully updated ${productIds.length} products`);
      setSelectedProductIds(new Set());
      fetchMembers(selectedGroupId);
      fetchProducts();
      refreshGroups();
    } catch (err: any) {
      toast.error(err.message || 'Error processing bulk update');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Checkbox select toggle
  const toggleSelectProduct = (productId: string) => {
    const newSet = new Set(selectedProductIds);
    if (newSet.has(productId)) {
      newSet.delete(productId);
    } else {
      newSet.add(productId);
    }
    setSelectedProductIds(newSet);
  };

  const toggleSelectAllProducts = (displayedProducts: Product[]) => {
    const allSelected = displayedProducts.every((p) => selectedProductIds.has(p.id));
    const newSet = new Set(selectedProductIds);
    if (allSelected) {
      displayedProducts.forEach((p) => newSet.delete(p.id));
    } else {
      displayedProducts.forEach((p) => newSet.add(p.id));
    }
    setSelectedProductIds(newSet);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-0 w-full overflow-hidden rounded-2xl border border-border/80 bg-background/50 backdrop-blur-md shadow-xl lg:flex-row flex-col">
      {/* Sidebar Panel: Groups list */}
      <div className="flex flex-col border-b border-border/80 lg:border-b-0 lg:border-r border-border/80 lg:w-[340px] w-full min-h-0 bg-muted/10">
        <div className="flex items-center justify-between border-b border-border/80 p-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Product Groups</h2>
            <Badge variant="secondary" className="px-2 py-0">
              {groups.length}
            </Badge>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => setIsCreatingGroup(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Group Sidebar Search */}
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              className="pl-8 bg-background/80"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Groups Scroll List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Boxes className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground font-medium">No groups found</p>
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isSelected = g.id === selectedGroupId;
              const brand = brands.find((b) => b.id === g.brand_id);
              return (
                <button
                  key={g.id}
                  onClick={() => handleSelectGroup(g.id)}
                  className={`w-full flex flex-col items-start gap-1 p-3 text-left rounded-xl transition-all duration-200 border ${
                    isSelected
                      ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-muted/40 text-foreground'
                  }`}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-1 flex-1">
                      {g.name}
                    </span>
                    <Badge variant="outline" className={`shrink-0 ${isSelected ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
                      {g.member_count !== undefined ? g.member_count : 0}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {brand && <span className="truncate">{brand.name}</span>}
                    {brand && <span className="text-muted-foreground/30">•</span>}
                    <span className="truncate">/{g.slug}</span>
                    {!g.is_active && (
                      <>
                        <span className="text-muted-foreground/30">•</span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] uppercase font-bold tracking-wider">
                          Inactive
                        </Badge>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Workspace Workspace */}
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        {!selectedGroupId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-background via-muted/5 to-muted/20">
            <div className="rounded-2xl border border-dashed border-border/80 bg-background/50 p-12 max-w-md shadow-lg flex flex-col items-center justify-center">
              <div className="p-4 rounded-full bg-primary/5 border border-primary/20 mb-4 animate-pulse">
                <Boxes className="h-10 w-10 text-primary" />
              </div>
              <CardTitle className="text-xl font-bold mb-2">No Group Selected</CardTitle>
              <CardDescription className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Choose a product group from the sidebar to manage storefront variants, edit settings, and assign catalog products in bulk.
              </CardDescription>
              <Button onClick={() => setIsCreatingGroup(true)} className="rounded-xl shadow-md transition-transform active:scale-95">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create new group
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col min-h-0">
            {/* Workspace Header */}
            <div className="flex items-center justify-between border-b border-border/80 p-4 flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-foreground line-clamp-1">
                    {activeGroup?.name}
                  </h1>
                  {!activeGroup?.is_active && (
                    <Badge variant="secondary" className="px-2 py-0 text-[10px] uppercase tracking-wider">
                      Inactive
                    </Badge>
                  )}
                  {activeGroup?.brand_id && (
                    <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">
                      {brands.find((b) => b.id === activeGroup.brand_id)?.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Slug: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">/products/{activeGroup?.slug}</span>
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="rounded-xl">
                  <a href={`/products/${activeGroup?.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Storefront
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleSelectGroup(selectedGroupId)} className="rounded-xl">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Workspace Content Tabs */}
            <Tabs defaultValue="members" className="flex-1 flex flex-col min-h-0">
              <div className="px-4 border-b border-border/50 bg-muted/10">
                <TabsList className="h-10 bg-transparent gap-1">
                  <TabsTrigger value="members" className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 border-b-2 border-transparent">
                    Members ({members.length})
                  </TabsTrigger>
                  <TabsTrigger value="catalog" className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 border-b-2 border-transparent">
                    Assign Catalog Products
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2 border-b-2 border-transparent">
                    Settings
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* TAB 1: Members list */}
              <TabsContent value="members" className="flex-1 overflow-y-auto p-4 space-y-4 outline-none">
                {isLoadingMembers ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Loading group members...</p>
                  </div>
                ) : members.length === 0 ? (
                  <Card className="border-dashed border-2 p-8 text-center rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <FolderOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                      <h3 className="font-semibold text-lg mb-1">No products in group</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mb-4">
                        This product group is currently empty. Switch to the Catalog tab to add variant products.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
                      <span>Product Details</span>
                      <span>Sort Order & Actions</span>
                    </div>
                    <div className="space-y-2">
                      {members.map((p, idx) => {
                        const isDefault = p.id === activeGroup?.default_product_id || p.group?.is_default;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between gap-4 p-3 rounded-2xl border transition-all duration-200 bg-background ${
                              isDefault ? 'border-amber-500/20 bg-amber-500/[0.01]' : 'border-border/80 hover:border-border'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Thumbnail */}
                              <div className="h-12 w-12 rounded-xl border border-border/80 bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                {p.images && p.images[0] ? (
                                  <img
                                    src={p.images[0]}
                                    alt={p.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Boxes className="h-5 w-5 text-muted-foreground/40" />
                                )}
                              </div>

                              <div className="min-w-0 space-y-0.5">
                                <h4 className="font-semibold text-sm text-foreground line-clamp-1 leading-tight">
                                  {p.name}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                  <Badge variant="outline" className="px-1.5 py-0 font-semibold">${p.price.toFixed(2)}</Badge>
                                  {p.stock_status && (
                                    <span className={`capitalize ${p.stock_status === 'in_stock' ? 'text-emerald-500 font-medium' : 'text-rose-500'}`}>
                                      {p.stock_status.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Sort order actions */}
                              <div className="flex items-center border border-border/80 rounded-xl overflow-hidden bg-muted/10 mr-2">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 rounded-none border-r border-border/80 hover:bg-muted"
                                  onClick={() => handleReorder(idx, 'up')}
                                  disabled={idx === 0}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </Button>
                                <span className="px-2 text-xs font-semibold text-foreground/80 min-w-6 text-center select-none font-mono">
                                  {idx + 1}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 rounded-none border-l border-border/80 hover:bg-muted"
                                  onClick={() => handleReorder(idx, 'down')}
                                  disabled={idx === members.length - 1}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              {/* Star default action */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSetDefault(p.id)}
                                className={`rounded-xl h-8 px-2.5 text-xs flex items-center gap-1 ${
                                  isDefault
                                    ? 'text-amber-500 hover:text-amber-600 bg-amber-500/5'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${isDefault ? 'fill-current' : ''}`} />
                                {isDefault ? 'Default' : 'Set Default'}
                              </Button>

                              {/* Remove action */}
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => handleProductAction('remove', p.id)}
                                className="h-8 w-8 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: Catalog assign products */}
              <TabsContent value="catalog" className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 outline-none gap-4">
                {/* Search / Filter Controls */}
                <div className="grid gap-3 sm:grid-cols-[1fr_200px_180px] items-end shrink-0">
                  <div className="space-y-1.5">
                    <Label htmlFor="prod-search" className="text-xs font-semibold">Search Catalog</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="prod-search"
                        placeholder="Search products by name or SKU..."
                        className="pl-8 rounded-xl bg-background"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="brand-filter" className="text-xs font-semibold">Filter by Brand</Label>
                    <select
                      id="brand-filter"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 cursor-pointer hover:border-border transition-all"
                      value={selectedBrandId}
                      onChange={(e) => setSelectedBrandId(e.target.value)}
                    >
                      <option value="">All Brands</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="status-filter" className="text-xs font-semibold">Group Status</Label>
                    <select
                      id="status-filter"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 cursor-pointer hover:border-border transition-all"
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as any)}
                    >
                      <option value="ungrouped">Ungrouped only</option>
                      <option value="in_group">In other groups</option>
                      <option value="all">All products</option>
                    </select>
                  </div>
                </div>

                {/* Bulk actions bar */}
                {selectedProductIds.size > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20 shrink-0 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                      <span className="font-semibold text-primary">
                        {selectedProductIds.size} product{selectedProductIds.size === 1 ? '' : 's'} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleBulkAction(selectedStatus === 'in_group' ? 'bulk_transfer' : 'bulk_add')}
                        className="rounded-xl shadow-md h-8 text-xs px-3"
                      >
                        {selectedStatus === 'in_group' ? 'Transfer to Group' : 'Add to Group'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedProductIds(new Set())}
                        className="rounded-xl h-8 text-xs hover:bg-primary/5 text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}

                {/* Product Search Results List */}
                <div className="flex-1 overflow-y-auto min-h-0 border border-border/80 rounded-2xl bg-muted/[0.05]">
                  {isLoadingProducts ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                      <p className="text-sm text-muted-foreground">Searching catalog...</p>
                    </div>
                  ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                      <Info className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground font-semibold">No products match your criteria</p>
                      <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                        Try clearing search text or expanding the brand/status filters.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/20 text-xs font-semibold text-muted-foreground select-none">
                          <th className="p-3 w-10">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={products.every((p) => selectedProductIds.has(p.id))}
                              onChange={() => toggleSelectAllProducts(products)}
                            />
                          </th>
                          <th className="p-3">Product</th>
                          <th className="p-3 hidden sm:table-cell">Brand</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => {
                          const isMemberOfCurrent = p.group?.group_id === selectedGroupId;
                          const inOtherGroup = p.group && p.group.group_id !== selectedGroupId;
                          const isSelected = selectedProductIds.has(p.id);

                          return (
                            <tr
                              key={p.id}
                              className={`border-b border-border/40 hover:bg-muted/10 transition-colors text-sm ${
                                isSelected ? 'bg-primary/[0.02]' : ''
                              }`}
                            >
                              <td className="p-3 align-middle">
                                <input
                                  type="checkbox"
                                  className="rounded border-border cursor-pointer"
                                  checked={isSelected}
                                  onChange={() => toggleSelectProduct(p.id)}
                                />
                              </td>
                              <td className="p-3 align-middle">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-8 w-8 rounded-lg border border-border/50 bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                                    {p.images && p.images[0] ? (
                                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <Boxes className="h-4 w-4 text-muted-foreground/30" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-semibold text-foreground line-clamp-1">{p.name}</span>
                                    <span className="text-xs text-muted-foreground font-mono">${p.price.toFixed(2)}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 align-middle hidden sm:table-cell text-muted-foreground truncate max-w-[120px]">
                                {p.brand?.name || '-'}
                              </td>
                              <td className="p-3 align-middle">
                                {isMemberOfCurrent ? (
                                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-500 bg-emerald-500/5">
                                    Member
                                  </Badge>
                                ) : inOtherGroup ? (
                                  <Badge variant="outline" className="border-amber-500/20 text-amber-500 bg-amber-500/5 max-w-[160px] truncate block">
                                    Group: {p.group?.group_name}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-border text-muted-foreground bg-muted/5">
                                    Ungrouped
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 align-middle text-right">
                                {isMemberOfCurrent ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleProductAction('remove', p.id)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl h-8 text-xs"
                                  >
                                    Remove
                                  </Button>
                                ) : inOtherGroup ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleProductAction('transfer', p.id)}
                                    className="text-amber-500 border-amber-500/20 hover:bg-amber-500/10 rounded-xl h-8 text-xs font-semibold"
                                  >
                                    Transfer
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleProductAction('add', p.id)}
                                    className="text-primary hover:text-primary hover:bg-primary/10 rounded-xl h-8 text-xs font-semibold"
                                  >
                                    + Add
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </TabsContent>

              {/* TAB 3: Group Settings form */}
              <TabsContent value="settings" className="flex-1 overflow-y-auto p-4 space-y-6 outline-none">
                <Card className="rounded-2xl border border-border/80 shadow-md">
                  <CardHeader>
                    <CardTitle>Edit details</CardTitle>
                    <CardDescription>
                      Storefront page settings, description, and group active state.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="edit-name">Group Name</Label>
                          <Input
                            id="edit-name"
                            value={editName}
                            onChange={(e) => handleNameChange(e.target.value)}
                            required
                            placeholder="e.g. Blue Buffalo Formula"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-slug">URL Slug</Label>
                          <Input
                            id="edit-slug"
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            required
                            pattern="[a-z0-9-]+"
                            placeholder="lowercase-hyphens-only"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="edit-brand">Brand</Label>
                          <select
                            id="edit-brand"
                            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 hover:border-border cursor-pointer transition-all"
                            value={editBrandId}
                            onChange={(e) => setEditBrandId(e.target.value)}
                          >
                            <option value="">No brand selected</option>
                            {brands.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="edit-hero-url">Hero Image URL</Label>
                          <Input
                            id="edit-hero-url"
                            value={editHeroUrl}
                            onChange={(e) => setEditHeroUrl(e.target.value)}
                            placeholder="https://..."
                            type="url"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-desc">Description</Label>
                        <textarea
                          id="edit-desc"
                          className="min-h-[100px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm hover:border-border transition-all"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Shared description copy displayed on storefront..."
                        />
                      </div>

                      <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 hover:bg-muted/50 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={editIsActive}
                          onChange={(e) => setEditIsActive(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-semibold text-foreground">Active on storefront</span>
                          <span className="block text-xs text-muted-foreground leading-normal">
                            If unchecked, this group remains hidden from customers on the storefront.
                          </span>
                        </span>
                      </label>

                      <div className="flex items-center gap-2">
                        <Button type="submit" disabled={isSavingSettings} className="rounded-xl">
                          {isSavingSettings ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save changes'
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {/* Destructive actions Card */}
                <Card className="border-red-500/10 bg-red-500/[0.01] rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-red-600 font-bold">Destructive Actions</CardTitle>
                    <CardDescription>
                      Permanently delete this group. Products inside this group will not be deleted but will become ungrouped.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="destructive" onClick={handleDeleteGroup} className="rounded-xl font-semibold">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete product group
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* MODAL: Inline Group Creation */}
      <Dialog open={isCreatingGroup} onOpenChange={setIsCreatingGroup}>
        <DialogContent className="max-w-md rounded-2xl border border-border/80">
          <form onSubmit={handleCreateGroup}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">New Product Group</DialogTitle>
              <DialogDescription className="text-xs">
                Combine related products under one storefront page, sharing settings and imagery.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Group Name</Label>
                <Input
                  id="new-name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Blue Buffalo Life Protection"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-slug">URL Slug</Label>
                <Input
                  id="new-slug"
                  value={newGroupSlug}
                  onChange={(e) => setNewGroupSlug(e.target.value)}
                  placeholder="blue-buffalo-life-protection"
                  required
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers, and hyphens only"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-brand">Brand</Label>
                <select
                  id="new-brand"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm h-10 hover:border-border cursor-pointer transition-all"
                  value={newGroupBrandId}
                  onChange={(e) => setNewGroupBrandId(e.target.value)}
                >
                  <option value="">No brand selected</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-desc">Description</Label>
                <textarea
                  id="new-desc"
                  className="min-h-[80px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm hover:border-border transition-all"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="Optional storefront description copy..."
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreatingGroup(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingGroup} className="rounded-xl font-semibold">
                {isSubmittingGroup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Group'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
