'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus, Loader2, Database, Ghost, TriangleAlert, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { addTestSku, removeTestSku, bulkRemoveTestSkus, bulkUpdateTestSkuType } from '@/lib/admin/scraper-configs/actions-normalized';
import { ScraperTestSku } from '@/lib/admin/scrapers/types';

interface SkuSidebarProps {
  configId: string;
  testSkus: ScraperTestSku[];
}

export function SkuSidebar({ configId, testSkus }: SkuSidebarProps) {
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<'test' | 'fake' | 'edge_case'>('test');
  const [newSku, setNewSku] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);

  const testTypeSkus = testSkus.filter(s => s.sku_type === 'test');
  const fakeTypeSkus = testSkus.filter(s => s.sku_type === 'fake');
  const edgeCaseTypeSkus = testSkus.filter(s => s.sku_type === 'edge_case');

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBulkActionRunning(true);
    try {
      const result = await bulkRemoveTestSkus(Array.from(selectedIds));
      if (result.success) {
        toast.success(`Removed ${selectedIds.size} SKUs`);
        setSelectedIds(new Set());
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to remove SKUs');
      }
    } catch (error: any) {
      toast.error('Bulk Delete Error', { description: error.message });
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleBulkTypeChange = async (newType: 'test' | 'fake' | 'edge_case') => {
    if (selectedIds.size === 0) return;

    setIsBulkActionRunning(true);
    try {
      const result = await bulkUpdateTestSkuType(Array.from(selectedIds), newType);
      if (result.success) {
        toast.success(`Updated ${selectedIds.size} SKUs to ${newType}`);
        setSelectedIds(new Set());
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to update SKUs');
      }
    } catch (error: any) {
      toast.error('Bulk Update Error', { description: error.message });
    } finally {
      setIsBulkActionRunning(false);
    }
  };

  const handleAddSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim()) return;

    setIsAdding(true);
    try {
      const result = await addTestSku(configId, newSku.trim(), activeTab);
      
      if (result.success) {
        setNewSku('');
        toast.success('SKU Added');
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to add SKU');
      }
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveSku = async (id: string, sku: string) => {
    setRemovingId(id);
    try {
      const result = await removeTestSku(id);
      
      if (result.success) {
        toast.success('SKU Removed');
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to remove SKU');
      }
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setRemovingId(null);
    }
  };

  const SkuList = ({ skus }: { skus: ScraperTestSku[] }) => (
    <div className="space-y-1 max-h-[calc(100vh-450px)] overflow-y-auto pr-1 custom-scrollbar">
      {skus.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-4 italic">No items</p>
      ) : (
        skus.map((sku) => (
          <div 
            key={sku.id} 
            className="flex items-center gap-2 p-1.5 rounded border bg-card/50 hover:bg-muted/50 transition-colors group"
          >
            <Checkbox 
              checked={selectedIds.has(sku.id)} 
              onCheckedChange={() => toggleSelect(sku.id)}
              className="h-3 w-3"
              data-testid={`sku-checkbox-${sku.id}`}
            />
            <span className="font-mono text-[10px] truncate flex-1">{sku.sku}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              onClick={() => handleRemoveSku(sku.id, sku.sku)}
              disabled={removingId === sku.id || isBulkActionRunning}
            >
              {removingId === sku.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-muted/10 border-r overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Database className="h-3 w-3" />
          Test Inventory
        </h2>
      </div>
      
      <div className="p-3 space-y-4 flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 h-8 p-1 bg-muted/50 shrink-0">
            <TabsTrigger value="test" className="text-[10px] py-1 px-0 flex items-center gap-1">
              Test
              <Badge variant="secondary" className="h-3 px-1 text-[8px] min-w-[12px] flex items-center justify-center">
                {testTypeSkus.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="fake" className="text-[10px] py-1 px-0 flex items-center gap-1">
              Fake
              <Badge variant="secondary" className="h-3 px-1 text-[8px] min-w-[12px] flex items-center justify-center">
                {fakeTypeSkus.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="edge_case" className="text-[10px] py-1 px-0 flex items-center gap-1">
              Edge
              <Badge variant="secondary" className="h-3 px-1 text-[8px] min-w-[12px] flex items-center justify-center">
                {edgeCaseTypeSkus.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 shrink-0">
            <form onSubmit={handleAddSku} className="flex gap-2 mb-3">
              <Input
                placeholder="SKU..."
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                className="h-7 text-[10px] px-2 flex-1"
                disabled={isAdding || isBulkActionRunning}
              />
              <Button type="submit" size="sm" className="h-7 w-7 p-0" disabled={isAdding || isBulkActionRunning || !newSku.trim()} data-testid="add-sku-btn">
                {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            </form>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="test" className="mt-0 h-full">
              <SkuList skus={testTypeSkus} />
            </TabsContent>
            <TabsContent value="fake" className="mt-0 h-full">
              <SkuList skus={fakeTypeSkus} />
            </TabsContent>
            <TabsContent value="edge_case" className="mt-0 h-full">
              <SkuList skus={edgeCaseTypeSkus} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Bulk Actions Footer */}
      {selectedIds.size > 0 && (
        <div className="p-3 border-t bg-primary/5 space-y-2 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium">{selectedIds.size} Selected</span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 text-[9px] px-1.5"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-[10px] gap-1"
              onClick={() => handleBulkTypeChange(activeTab)}
              disabled={isBulkActionRunning}
            >
              <Settings2 className="h-3 w-3" />
              Change Type
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              className="h-7 text-[10px] gap-1"
              onClick={handleBulkDelete}
              disabled={isBulkActionRunning}
            >
              {isBulkActionRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Bulk Delete
            </Button>
          </div>
        </div>
      )}

      <div className="p-3 border-t bg-muted/20">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Total SKUs</span>
            <span>{testSkus.length}</span>
          </div>
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary" 
              style={{ width: `${Math.min(100, (testSkus.length / 20) * 100)}%` }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}
