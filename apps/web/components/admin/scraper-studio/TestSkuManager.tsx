'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Filter,
  MoreHorizontal,
  FileCode,
  Tag,
  Package,
  Boxes,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { TestSku, TestSkuType } from '@/lib/admin/scraper-studio/test-sku-actions';
import {
  fetchTestSkus,
  addTestSku,
  bulkAddTestSkus,
  deleteTestSku,
  bulkDeleteTestSkus,
  importTestSkusFromConfig,
  clearTestSkus,
} from '@/lib/admin/scraper-studio/test-sku-actions';

interface TestSkuManagerProps {
  configId: string;
  configYaml?: string;
}

const SKU_TYPE_CONFIG: Record<TestSkuType, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  test: {
    label: 'Test SKU',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: <CheckCircle2 className="h-3 w-3" />,
    description: 'Known good SKUs that should succeed',
  },
  fake: {
    label: 'Fake SKU',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: <X className="h-3 w-3" />,
    description: 'Invalid SKUs that should fail gracefully (404)',
  },
  edge_case: {
    label: 'Edge Case',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: <AlertCircle className="h-3 w-3" />,
    description: 'Boundary test SKUs for edge case validation',
  },
};

function validateSkuFormat(sku: string): { valid: boolean; error?: string } {
  const trimmed = sku.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'SKU cannot be empty' };
  }
  
  if (trimmed.length > 255) {
    return { valid: false, error: 'SKU cannot exceed 255 characters' };
  }
  
  const validPattern = /^[a-zA-Z0-9\-_./\s#@$%&*()]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'SKU contains invalid characters' };
  }
  
  return { valid: true };
}

export function TestSkuManager({ configId, configYaml }: TestSkuManagerProps) {
  const [skus, setSkus] = useState<TestSku[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TestSkuType>('test');
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newSkuType, setNewSkuType] = useState<TestSkuType>('test');
  const [skuValidationError, setSkuValidationError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkAddDialogOpen, setIsBulkAddDialogOpen] = useState(false);
  const [bulkSkus, setBulkSkus] = useState('');
  const [bulkSkuType, setBulkSkuType] = useState<TestSkuType>('test');
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skuToDelete, setSkuToDelete] = useState<TestSku | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearTypeDialogOpen, setIsClearTypeDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const loadSkus = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchTestSkus(configId);
      if (result.success && result.skus) {
        setSkus(result.skus);
      } else {
        toast.error(result.error || 'Failed to load test SKUs');
      }
    } catch (error) {
      toast.error('Failed to load test SKUs');
    } finally {
      setIsLoading(false);
    }
  }, [configId]);

  useEffect(() => {
    loadSkus();
  }, [loadSkus]);

  const filteredSkus = skus.filter((sku) => sku.sku_type === activeTab);

  const handleAddSku = async () => {
    const validation = validateSkuFormat(newSku);
    if (!validation.valid) {
      setSkuValidationError(validation.error || 'Invalid SKU');
      return;
    }

    setIsAdding(true);
    try {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('sku', newSku.trim());
      formData.append('skuType', newSkuType);

      const result = await addTestSku(formData);
      if (result.success) {
        toast.success('SKU added successfully');
        setNewSku('');
        setSkuValidationError(null);
        setIsAddDialogOpen(false);
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to add SKU');
      }
    } catch (error) {
      toast.error('Failed to add SKU');
    } finally {
      setIsAdding(false);
    }
  };

  const handleBulkAdd = async () => {
    const lines = bulkSkus.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    
    if (lines.length === 0) {
      toast.error('Please enter at least one SKU');
      return;
    }

    const validationErrors: string[] = [];
    const validSkus: string[] = [];

    for (const sku of lines) {
      const validation = validateSkuFormat(sku);
      if (validation.valid) {
        validSkus.push(sku);
      } else {
        validationErrors.push(`${sku}: ${validation.error}`);
      }
    }

    if (validSkus.length === 0) {
      toast.error('No valid SKUs found');
      return;
    }

    setIsBulkAdding(true);
    try {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('skus', JSON.stringify(validSkus));
      formData.append('skuType', bulkSkuType);

      const result = await bulkAddTestSkus(formData);
      if (result.success) {
        const addedCount = (result.data as { added?: number })?.added || validSkus.length;
        toast.success(`${addedCount} SKUs added successfully`);
        if (validationErrors.length > 0) {
          toast.warning(`${validationErrors.length} SKUs had validation errors`);
        }
        setBulkSkus('');
        setIsBulkAddDialogOpen(false);
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to add SKUs');
      }
    } catch (error) {
      toast.error('Failed to add SKUs');
    } finally {
      setIsBulkAdding(false);
    }
  };

  const handleImportFromConfig = async () => {
    if (!configYaml) {
      toast.error('No config YAML available');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('configYaml', configYaml);

      const result = await importTestSkusFromConfig(formData);
      if (result.success) {
        const data = result.data as { imported?: number; types?: Record<string, number> };
        toast.success(`Imported ${data?.imported || 0} SKUs from config`);
        setIsImportDialogOpen(false);
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to import SKUs');
      }
    } catch (error) {
      toast.error('Failed to import SKUs');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteSku = async () => {
    if (!skuToDelete) return;

    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('skuId', skuToDelete.id);

      const result = await deleteTestSku(formData);
      if (result.success) {
        toast.success('SKU deleted successfully');
        setIsDeleteDialogOpen(false);
        setSkuToDelete(null);
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to delete SKU');
      }
    } catch (error) {
      toast.error('Failed to delete SKU');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSkus.size === 0) return;

    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append('skuIds', JSON.stringify(Array.from(selectedSkus)));

      const result = await bulkDeleteTestSkus(formData);
      if (result.success) {
        const deletedCount = (result.data as { deleted?: number })?.deleted || selectedSkus.size;
        toast.success(`${deletedCount} SKUs deleted successfully`);
        setSelectedSkus(new Set());
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to delete SKUs');
      }
    } catch (error) {
      toast.error('Failed to delete SKUs');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearType = async () => {
    setIsClearing(true);
    try {
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('skuType', activeTab);

      const result = await clearTestSkus(formData);
      if (result.success) {
        toast.success(`${SKU_TYPE_CONFIG[activeTab].label}s cleared successfully`);
        setIsClearTypeDialogOpen(false);
        await loadSkus();
      } else {
        toast.error(result.error || 'Failed to clear SKUs');
      }
    } catch (error) {
      toast.error('Failed to clear SKUs');
    } finally {
      setIsClearing(false);
    }
  };

  const toggleSkuSelection = (skuId: string) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(skuId)) {
      newSelected.delete(skuId);
    } else {
      newSelected.add(skuId);
    }
    setSelectedSkus(newSelected);
  };

  const selectAllInType = () => {
    const typeSkuIds = filteredSkus.map((s) => s.id);
    const newSelected = new Set(selectedSkus);
    typeSkuIds.forEach((id) => newSelected.add(id));
    setSelectedSkus(newSelected);
  };

  const deselectAll = () => {
    setSelectedSkus(new Set());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Test SKU Management
              </CardTitle>
              <CardDescription>
                Manage test, fake, and edge-case SKUs for validation testing
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedSkus.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete {selectedSkus.size} selected
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportDialogOpen(true)}
                disabled={!configYaml}
                title={!configYaml ? 'No config YAML available' : 'Import from config'}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import from Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkAddDialogOpen(true)}
              >
                <Boxes className="mr-2 h-4 w-4" />
                Bulk Add
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setNewSkuType(activeTab);
                  setIsAddDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add SKU
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TestSkuType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="test" className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Test ({skus.filter((s) => s.sku_type === 'test').length})
              </TabsTrigger>
              <TabsTrigger value="fake" className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Fake ({skus.filter((s) => s.sku_type === 'fake').length})
              </TabsTrigger>
              <TabsTrigger value="edge_case" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Edge Case ({skus.filter((s) => s.sku_type === 'edge_case').length})
              </TabsTrigger>
            </TabsList>

            {(['test', 'fake', 'edge_case'] as TestSkuType[]).map((type) => (
              <TabsContent key={type} value={type} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {SKU_TYPE_CONFIG[type].description}
                  </div>
                  <div className="flex items-center gap-2">
                    {filteredSkus.length > 0 && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={selectAllInType}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={deselectAll}
                        >
                          Deselect All
                        </Button>
                        <Separator orientation="vertical" className="h-4" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setIsClearTypeDialogOpen(true)}
                        >
                          Clear All
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-[300px] rounded-md border">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredSkus.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Package className="h-8 w-8 mb-2" />
                      <p className="text-sm">No {SKU_TYPE_CONFIG[type].label}s</p>
                      <p className="text-xs">Add SKUs to test this scraper</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredSkus.map((sku) => (
                        <div
                          key={sku.id}
                          className={cn(
                            'flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors',
                            selectedSkus.has(sku.id) && 'bg-muted'
                          )}
                        >
                          <Checkbox
                            checked={selectedSkus.has(sku.id)}
                            onCheckedChange={() => toggleSkuSelection(sku.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                                {sku.sku}
                              </code>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Added {format(new Date(sku.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => {
                              setSkuToDelete(sku);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>


      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {SKU_TYPE_CONFIG[newSkuType].label}</DialogTitle>
            <DialogDescription>
              Enter a SKU to add to the {SKU_TYPE_CONFIG[newSkuType].label.toLowerCase()} list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>SKU Type</Label>
              <div className="flex gap-2">
                {(['test', 'fake', 'edge_case'] as TestSkuType[]).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={newSkuType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewSkuType(type)}
                    className="flex-1"
                  >
                    {SKU_TYPE_CONFIG[type].icon}
                    <span className="ml-2">{SKU_TYPE_CONFIG[type].label}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU Value</Label>
              <Input
                id="sku"
                value={newSku}
                onChange={(e) => {
                  setNewSku(e.target.value);
                  setSkuValidationError(null);
                }}
                placeholder="Enter SKU..."
                className={cn(skuValidationError && 'border-destructive')}
              />
              {skuValidationError && (
                <p className="text-sm text-destructive">{skuValidationError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Alphanumeric characters, hyphens, underscores, dots, and slashes allowed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSku} disabled={isAdding || !newSku.trim()}>
              {isAdding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add SKU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={isBulkAddDialogOpen} onOpenChange={setIsBulkAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Add SKUs</DialogTitle>
            <DialogDescription>
              Enter multiple SKUs separated by commas or new lines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>SKU Type</Label>
              <div className="flex gap-2">
                {(['test', 'fake', 'edge_case'] as TestSkuType[]).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={bulkSkuType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBulkSkuType(type)}
                    className="flex-1"
                  >
                    {SKU_TYPE_CONFIG[type].icon}
                    <span className="ml-2">{SKU_TYPE_CONFIG[type].label}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-skus">SKUs (one per line or comma-separated)</Label>
              <Textarea
                id="bulk-skus"
                value={bulkSkus}
                onChange={(e) => setBulkSkus(e.target.value)}
                placeholder="SKU001&#10;SKU002&#10;SKU003"
                className="min-h-[150px] font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {bulkSkus.split(/\n|,/).filter(Boolean).length} SKUs entered
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAdd}
              disabled={isBulkAdding || !bulkSkus.trim()}
            >
              {isBulkAdding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Boxes className="mr-2 h-4 w-4" />
              )}
              Add SKUs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Config YAML</DialogTitle>
            <DialogDescription>
              Import test SKUs defined in the configuration file. This will extract SKUs from
              test_skus, fake_skus, and edge_case_skus arrays.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-md bg-muted p-4 text-sm">
              <p className="font-medium mb-2">Will import:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• test_skus → Test SKUs (golden/known good)</li>
                <li>• fake_skus → Fake SKUs (expect 404)</li>
                <li>• edge_case_skus → Edge Case SKUs</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportFromConfig} disabled={isImporting}>
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import SKUs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SKU</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the SKU &quot;{skuToDelete?.sku}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSkuToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSku}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <AlertDialog open={isClearTypeDialogOpen} onOpenChange={setIsClearTypeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All {SKU_TYPE_CONFIG[activeTab].label}s</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all {filteredSkus.length} {SKU_TYPE_CONFIG[activeTab].label.toLowerCase()}s?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearType}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
