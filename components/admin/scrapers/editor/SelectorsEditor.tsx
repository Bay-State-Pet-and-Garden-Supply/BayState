'use client';

import React from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SelectorConfig } from '@/lib/admin/scrapers/types';
import { Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// Helper to get or ensure a selector has an ID
function getSelectorId(sel: SelectorConfig, index: number): string {
  return sel.id || `selector-${index}`;
}

export function SelectorsEditor() {
  const { config, addSelector, updateSelector, removeSelector } = useScraperEditorStore();

  // Ensure all selectors have IDs on first render (migration helper)
  React.useEffect(() => {
    const selectorsWithoutId = config.selectors.filter((sel) => !sel.id);
    if (selectorsWithoutId.length > 0) {
      // This is a one-time migration - selectors will get IDs on next save
      // The UI will use index-based fallback for these old selectors
    }
  }, [config.selectors]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data Selectors</h2>
          <p className="text-sm text-muted-foreground">Define what data to extract from the page.</p>
        </div>
        <Button onClick={() => addSelector({ name: '', selector: '', attribute: 'text', multiple: false, required: true })}>
          <Plus className="mr-2 h-4 w-4" /> Add Selector
        </Button>
      </div>

      <div className="grid gap-4">
        {config.selectors.length === 0 && (
          <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">No selectors defined. Add one to start extracting data.</p>
          </div>
        )}

        {config.selectors.map((sel, index) => {
          const selectorId = getSelectorId(sel, index);
          
          return (
            <Card key={selectorId}>
              <CardContent className="p-4 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
                  <div className="lg:col-span-3">
                    <Label className="text-xs mb-1.5 block">Name</Label>
                    <Input 
                      value={sel.name} 
                      onChange={(e) => updateSelector(selectorId, { name: e.target.value })}
                      placeholder="e.g. Product Title"
                    />
                  </div>
                  
                  <div className="lg:col-span-5">
                    <Label className="text-xs mb-1.5 block">CSS Selector</Label>
                    <Input 
                      value={sel.selector} 
                      onChange={(e) => updateSelector(selectorId, { selector: e.target.value })}
                      placeholder="#productTitle"
                      className="font-mono text-sm"
                    />
                  </div>
                  
                  <div className="lg:col-span-2">
                    <Label className="text-xs mb-1.5 block">Attribute</Label>
                    <Select 
                      value={sel.attribute} 
                      onValueChange={(v) => updateSelector(selectorId, { attribute: v as SelectorConfig['attribute'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text Content</SelectItem>
                        <SelectItem value="src">Image Source (src)</SelectItem>
                        <SelectItem value="href">Link (href)</SelectItem>
                        <SelectItem value="value">Input Value</SelectItem>
                        <SelectItem value="innerHTML">HTML</SelectItem>
                        <SelectItem value="alt">Alt Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="lg:col-span-1 flex flex-col justify-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={sel.multiple}
                        onCheckedChange={(checked) => updateSelector(selectorId, { multiple: checked })}
                        id={`multiple-${selectorId}`}
                      />
                      <Label htmlFor={`multiple-${selectorId}`} className="text-xs cursor-pointer">Multiple?</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={sel.required}
                        onCheckedChange={(checked) => updateSelector(selectorId, { required: checked })}
                        id={`required-${selectorId}`}
                      />
                      <Label htmlFor={`required-${selectorId}`} className="text-xs cursor-pointer">Required?</Label>
                    </div>
                  </div>

                  <div className="lg:col-span-1 flex justify-end">
                    <Button variant="ghost" size="icon" onClick={() => removeSelector(selectorId)} aria-label="Delete selector" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
