'use client';

import { useState, useEffect } from 'react';
import { Trash2, ExternalLink, Package, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineProduct } from '@/lib/pipeline/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

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
  
  // Update selected SKU if it's no longer in the list (e.g. after search or refresh)
  useEffect(() => {
    if (selectedSku && !products.find(p => p.sku === selectedSku)) {
      setSelectedSku(products.length > 0 ? products[0].sku : null);
    } else if (!selectedSku && products.length > 0) {
      setSelectedSku(products[0].sku);
    }
  }, [products, selectedSku]);

  const filteredProducts = products.filter(p => 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.consolidated?.name || p.input?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProduct = products.find(p => p.sku === selectedSku);

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

  return (
    <div className="flex h-[calc(100vh-300px)] border rounded-lg overflow-hidden bg-background shadow-sm">
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
        <ScrollArea className="flex-1">
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
        </ScrollArea>
      </div>

      {/* Right Column: Scraped Details */}
      <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
        {selectedProduct ? (
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {selectedProduct.consolidated?.name || selectedProduct.input?.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                    <span className="font-mono text-sm">{selectedProduct.sku}</span>
                    <span>•</span>
                    <span className="text-sm">Scraped Results</span>
                  </div>
                </div>
                <div className="flex gap-2">
                   <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`/admin/products/${selectedProduct.sku}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      View Product <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(selectedProduct.sources || {}).map(([key, source]: [string, any]) => (
                  <Card key={key} className="overflow-hidden border-2 hover:border-primary/20 transition-all">
                    <CardHeader className="p-4 bg-muted/50 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteSource(key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Price</span>
                        <span className="text-sm font-bold">${source.price?.toFixed(2) || '—'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Source Name</span>
                        <p className="text-xs font-medium line-clamp-2" title={source.name}>
                          {source.name || '—'}
                        </p>
                      </div>
                      {source.url && (
                        <Button variant="link" className="p-0 h-auto text-xs text-blue-600" asChild>
                          <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                            Visit Source <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      
                      <div className="pt-2 border-t mt-2">
                        <details>
                          <summary className="text-[10px] cursor-pointer text-muted-foreground uppercase font-bold tracking-wider">Raw JSON</summary>
                          <pre className="text-[10px] mt-2 bg-muted p-2 rounded overflow-x-auto max-h-40">
                            {JSON.stringify(source, null, 2)}
                          </pre>
                        </details>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                {Object.keys(selectedProduct.sources || {}).length === 0 && (
                  <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-background">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-medium">No sources found</h3>
                    <p className="text-muted-foreground text-sm">No scraper data is currently available for this product.</p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Package className="h-16 w-16 mb-4 opacity-10" />
            <h3 className="text-xl font-medium">Select a product</h3>
            <p>Choose a product from the list to view its scraped details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
