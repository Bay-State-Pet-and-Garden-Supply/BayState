'use client';

import { useState, useEffect } from 'react';
import { Trash2, ExternalLink, Package, Search, ImageIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineProduct } from '@/lib/pipeline/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

interface ScrapedResultsViewProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (sku: string, selected: boolean) => void;
  onRefresh: () => void;
}

export function ScrapedResultsView({ 
  products, 
  selectedSkus, 
  onSelectSku, 
  onRefresh 
}: ScrapedResultsViewProps) {
  const [selectedSku, setSelectedSku] = useState<string | null>(
    products.length > 0 ? products[0].sku : null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSource, setActiveSource] = useState<string>('');
  
  const filteredProducts = products.filter(p => 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.consolidated?.name || p.input?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProduct = products.find(p => p.sku === selectedSku);
  const sources = selectedProduct?.sources || {};
  const sourceKeys = Object.keys(sources);

  // Set active source when product selection changes
  useEffect(() => {
    if (sourceKeys.length > 0) {
      if (!activeSource || !sources[activeSource]) {
        setActiveSource(sourceKeys[0]);
      }
    } else {
      setActiveSource('');
    }
  }, [selectedSku, sourceKeys, activeSource, sources]);

  // Update selected SKU if it's no longer in the list (e.g. after search or refresh)
  useEffect(() => {
    if (selectedSku && !products.find(p => p.sku === selectedSku)) {
      setSelectedSku(products.length > 0 ? products[0].sku : null);
    } else if (!selectedSku && products.length > 0) {
      setSelectedSku(products[0].sku);
    }
  }, [products, selectedSku]);

  const handleDeleteSource = async (sourceKey: string) => {
    if (!selectedProduct) return;
    
    if (!confirm(`Are you sure you want to delete the source "${sourceKey}"?`)) {
      return;
    }

    try {
      const newSources = { ...selectedProduct.sources };
      delete newSources[sourceKey];

      const res = await fetch(`/api/admin/pipeline/${encodeURIComponent(selectedProduct.sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: newSources }),
      });

      if (res.ok) {
        toast.success(`Source "${sourceKey}" deleted`);
        onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete source');
      }
    } catch (error) {
      toast.error('An error occurred while deleting the source');
    }
  };

  const currentSourceData = activeSource ? (sources[activeSource] as any) : null;

  return (
    <div className="flex h-[calc(100vh-280px)] border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left Column: Product List */}
      <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5">
        <div className="p-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 bg-background"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y">
            {filteredProducts.map((product) => {
              const name = product.consolidated?.name || product.input?.name || 'Unknown';
              const price = product.consolidated?.price ?? product.input?.price;
              const sourceCount = Object.keys(product.sources || {}).length;
              const isSelected = selectedSku === product.sku;
              const isChecked = selectedSkus.has(product.sku);
              
              return (
                <div
                  key={product.sku}
                  className={`group p-3 cursor-pointer hover:bg-muted/50 transition-colors relative ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => setSelectedSku(product.sku)}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  )}
                  <div className="flex items-start gap-3">
                    <div 
                      className="pt-1" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSku(product.sku, !isChecked);
                      }}
                    >
                      <Checkbox 
                        checked={isChecked} 
                        onCheckedChange={(checked) => onSelectSku(product.sku, !!checked)}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-mono text-[10px] text-muted-foreground truncate flex-1 uppercase tracking-tight">
                          {product.sku}
                        </div>
                        {price !== undefined && (
                          <div className="text-sm font-bold text-primary">
                            ${price.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div className={`text-sm font-medium line-clamp-2 mt-0.5 ${isSelected ? 'text-primary' : ''}`}>
                        {name}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal bg-muted text-muted-foreground border-none">
                          {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                        </Badge>
                        {product.confidence_score !== undefined && (
                           <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${
                            product.confidence_score >= 0.8 ? 'border-green-200 bg-green-50 text-green-700' :
                            product.confidence_score >= 0.5 ? 'border-yellow-200 bg-yellow-50 text-yellow-700' :
                            'border-red-200 bg-red-50 text-red-700'
                          }`}>
                            {Math.round(product.confidence_score * 100)}% match
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="p-12 text-center text-muted-foreground text-sm">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                No products found matching your search.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Scraped Details */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header & Source Switcher */}
            <div className="p-4 border-b space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">
                    {selectedProduct.consolidated?.name || selectedProduct.input?.name}
                  </h2>
                  <p className="text-sm text-muted-foreground font-mono">{selectedProduct.sku}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/admin/products/${selectedProduct.sku}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                    View in Catalog <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>

              {sourceKeys.length > 0 ? (
                <Tabs value={activeSource} onValueChange={setActiveSource} className="w-full">
                  <div className="flex items-center justify-between gap-4">
                    <TabsList className="h-9 justify-start bg-muted/50 p-1 flex-1 overflow-x-auto">
                      {sourceKeys.map(key => (
                        <TabsTrigger key={key} value={key} className="text-xs px-3">
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive h-9 px-3 hover:bg-destructive/10"
                      onClick={() => handleDeleteSource(activeSource)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete {activeSource}
                    </Button>
                  </div>
                </Tabs>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-100">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">No results for this SKU yet.</span>
                </div>
              )}
            </div>

            {/* Product Result Display */}
            <div className="flex-1 overflow-y-auto p-6">
              {currentSourceData ? (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left side: Image */}
                    <div className="space-y-4">
                      <div className="aspect-square rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden relative group">
                        {currentSourceData.images?.[0] || currentSourceData.image_url ? (
                          <img 
                            src={currentSourceData.images?.[0] || currentSourceData.image_url} 
                            alt={currentSourceData.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground">
                            <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
                            <span className="text-xs">No image available</span>
                          </div>
                        )}
                        {currentSourceData.url && (
                          <a 
                            href={currentSourceData.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 bg-white/80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border"
                          >
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        )}
                      </div>
                      
                      {/* Secondary Images if any */}
                      {currentSourceData.images && currentSourceData.images.length > 1 && (
                        <div className="grid grid-cols-4 gap-2">
                          {currentSourceData.images.slice(1, 5).map((img: string, i: number) => (
                            <div key={i} className="aspect-square rounded-md border overflow-hidden bg-muted/20">
                              <img src={img} alt="" className="w-full h-full object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right side: Core Info */}
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                           <Badge variant="outline" className="text-primary border-primary/20 bg-primary/5">
                            {activeSource.toUpperCase()} RESULT
                           </Badge>
                           {currentSourceData.price && (
                             <span className="text-3xl font-black text-[#008850]">
                               ${currentSourceData.price.toFixed(2)}
                             </span>
                           )}
                        </div>
                        <h1 className="text-2xl font-bold leading-tight">{currentSourceData.name || 'Untitled Product'}</h1>
                        {currentSourceData.brand && (
                          <p className="text-sm font-medium text-muted-foreground">Brand: <span className="text-foreground">{currentSourceData.brand}</span></p>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Description</h3>
                        <div className="text-sm leading-relaxed text-zinc-600 prose prose-sm max-w-none">
                          {currentSourceData.description ? (
                            <div dangerouslySetInnerHTML={{ __html: currentSourceData.description }} />
                          ) : (
                            <p className="italic">No description provided by source.</p>
                          )}
                        </div>
                      </div>

                      {currentSourceData.url && (
                        <Button className="w-full bg-[#008850] hover:bg-[#008850]/90" asChild>
                          <a href={currentSourceData.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Visit Source Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Extra Data / Raw View */}
                  <div className="pt-8">
                     <Separator className="mb-8" />
                     <div className="space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                           <Package className="h-4 w-4" />
                           Technical Details (Raw Data)
                        </h3>
                        <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs overflow-x-auto border">
                          <pre>{JSON.stringify(currentSourceData, null, 2)}</pre>
                        </div>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                  <Package className="h-16 w-16 mb-4 opacity-10" />
                  <h3 className="text-xl font-medium">No results for {activeSource}</h3>
                  <p>Try selecting a different source or re-scraping this product.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Package className="h-16 w-16 mb-4 opacity-10" />
            <h3 className="text-xl font-medium">Select a product</h3>
            <p>Choose a product from the list to view its scraped results.</p>
          </div>
        )}
      </div>
    </div>
  );
}
