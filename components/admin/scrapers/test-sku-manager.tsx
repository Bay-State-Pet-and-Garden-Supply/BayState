'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { addTestSku, removeTestSku } from '@/lib/admin/scraper-configs/actions-normalized';
import { ScraperTestSku } from '@/lib/admin/scrapers/types';

interface TestSkuManagerProps {
  configId: string;
  testSkus: ScraperTestSku[];
}

export function TestSkuManager({ configId, testSkus }: TestSkuManagerProps) {
  const router = useRouter();
  // Use imported toast instead
  
  const [activeTab, setActiveTab] = useState<'test' | 'fake' | 'edge_case'>('test');
  const [newSku, setNewSku] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const testTypeSkus = testSkus.filter(s => s.sku_type === 'test');
  const fakeTypeSkus = testSkus.filter(s => s.sku_type === 'fake');
  const edgeCaseTypeSkus = testSkus.filter(s => s.sku_type === 'edge_case');

  const handleAddSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim()) return;

    setIsAdding(true);
    try {
      const result = await addTestSku(configId, newSku.trim(), activeTab);
      
      if (result.success) {
        setNewSku('');
        toast.success(
           'SKU Added', {
          description: `Successfully added ${newSku} as a ${activeTab.replace('_', ' ')} SKU.`,
        });
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to add SKU');
      }
    } catch (error: any) {
      toast.error('Error', { description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveSku = async (id: string, sku: string) => {
    setRemovingId(id);
    try {
      const result = await removeTestSku(id);
      
      if (result.success) {
        toast.success('SKU Removed', { description: `Successfully removed ${sku}.` });
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to remove SKU');
      }
    } catch (error: any) {
      toast.error('Error', { description: error.message || 'An unexpected error occurred.' });
    } finally {
      setRemovingId(null);
    }
  };

  const SkuList = ({ skus, type }: { skus: ScraperTestSku[], type: string }) => {
    if (skus.length === 0) {
      return (
        <div className="text-center p-6 bg-muted/30 rounded-md border border-dashed border-muted">
          <p className="text-sm text-muted-foreground">No {type} SKUs found.</p>
          <p className="text-xs text-muted-foreground mt-1">Add one above to get started.</p>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {skus.map((sku) => (
          <div 
            key={sku.id} 
            className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{sku.sku}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleRemoveSku(sku.id, sku.sku)}
              disabled={removingId === sku.id}
            >
              {removingId === sku.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="sr-only">Remove {sku.sku}</span>
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test SKUs</CardTitle>
        <CardDescription>
          Manage the items used to verify this scraper's configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="test" className="text-xs">
              Test
              <Badge variant="secondary" className="ml-1.5 h-4.5 px-1 font-normal text-[10px]">
                {testTypeSkus.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="fake" className="text-xs">
              Fake
              <Badge variant="secondary" className="ml-1.5 h-4.5 px-1 font-normal text-[10px]">
                {fakeTypeSkus.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="edge_case" className="text-xs">
              Edge Cases
              <Badge variant="secondary" className="ml-1.5 h-4.5 px-1 font-normal text-[10px]">
                {edgeCaseTypeSkus.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleAddSku} className="flex gap-2 mb-4">
            <Input
              placeholder={`Add ${activeTab.replace('_', ' ')} SKU...`}
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
              className="flex-1"
              disabled={isAdding}
            />
            <Button type="submit" disabled={isAdding || !newSku.trim()}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Add
            </Button>
          </form>

          <TabsContent value="test" className="mt-0">
            <SkuList skus={testTypeSkus} type="test" />
          </TabsContent>
          <TabsContent value="fake" className="mt-0">
            <SkuList skus={fakeTypeSkus} type="fake" />
          </TabsContent>
          <TabsContent value="edge_case" className="mt-0">
            <SkuList skus={edgeCaseTypeSkus} type="edge case" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
