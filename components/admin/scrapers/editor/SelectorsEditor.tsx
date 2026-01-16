'use client';

import React from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SelectorConfig } from '@/lib/admin/scrapers/types';
import { Trash2, Plus } from 'lucide-react';

export function SelectorsEditor() {
  const { config, addSelector, updateSelector, removeSelector } = useScraperEditorStore();

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

        {config.selectors.map((sel, idx) => (
          <Card key={idx}>
            <CardContent className="p-4 pt-6">
              <div className="grid grid-cols-12 gap-4 items-start">
                <div className="col-span-3">
                  <Label className="text-xs mb-1.5 block">Name</Label>
                  <Input 
                    value={sel.name} 
                    onChange={(e) => updateSelector(idx, { name: e.target.value })}
                    placeholder="e.g. Product Title"
                  />
                </div>
                
                <div className="col-span-4">
                  <Label className="text-xs mb-1.5 block">CSS Selector</Label>
                  <Input 
                    value={sel.selector} 
                    onChange={(e) => updateSelector(idx, { selector: e.target.value })}
                    placeholder="#productTitle"
                    className="font-mono text-sm"
                  />
                </div>
                
                <div className="col-span-2">
                  <Label className="text-xs mb-1.5 block">Attribute</Label>
                  <Select 
                    value={sel.attribute} 
                    onValueChange={(v) => updateSelector(idx, { attribute: v as SelectorConfig['attribute'] })}
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

                <div className="col-span-2 flex flex-col justify-center gap-2 pt-6">
                   <div className="flex items-center gap-2">
                    <Switch 
                      checked={sel.multiple}
                      onCheckedChange={(checked) => updateSelector(idx, { multiple: checked })}
                      id={`multiple-${idx}`}
                    />
                    <Label htmlFor={`multiple-${idx}`} className="text-xs cursor-pointer">Multiple?</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={sel.required}
                      onCheckedChange={(checked) => updateSelector(idx, { required: checked })}
                      id={`required-${idx}`}
                    />
                    <Label htmlFor={`required-${idx}`} className="text-xs cursor-pointer">Required?</Label>
                  </div>
                </div>

                <div className="col-span-1 pt-6 flex justify-end">
                  <Button variant="ghost" size="icon" onClick={() => removeSelector(idx)} aria-label="Delete selector" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
