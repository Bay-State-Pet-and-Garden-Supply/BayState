'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Copy, Check, Trash2, TestTube2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectorEntry {
  id: string;
  name: string;
  selector: string;
  type: 'css' | 'xpath';
  attribute?: string;
}

interface SelectorHelperProps {
  selectors?: SelectorEntry[];
  onSelectorsChange?: (selectors: SelectorEntry[]) => void;
  onTestSelector?: (selector: string, type: 'css' | 'xpath') => void;
}

export function SelectorHelper({ 
  selectors: initialSelectors = [], 
  onSelectorsChange,
  onTestSelector,
}: SelectorHelperProps) {
  const [selectors, setSelectors] = useState<SelectorEntry[]>(initialSelectors);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newSelector, setNewSelector] = useState('');
  const [newType, setNewType] = useState<'css' | 'xpath'>('css');
  const [newAttribute, setNewAttribute] = useState('');

  const handleAdd = () => {
    if (!newName.trim() || !newSelector.trim()) {
      toast.error('Name and selector are required');
      return;
    }

    const entry: SelectorEntry = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      selector: newSelector.trim(),
      type: newType,
      attribute: newAttribute.trim() || undefined,
    };

    const updated = [...selectors, entry];
    setSelectors(updated);
    onSelectorsChange?.(updated);

    setNewName('');
    setNewSelector('');
    setNewAttribute('');
    toast.success(`Added selector: ${entry.name}`);
  };

  const handleRemove = (id: string) => {
    const updated = selectors.filter((s) => s.id !== id);
    setSelectors(updated);
    onSelectorsChange?.(updated);
  };

  const handleCopy = async (selector: string, id: string) => {
    await navigator.clipboard.writeText(selector);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTest = (selector: string, type: 'css' | 'xpath') => {
    if (onTestSelector) {
      onTestSelector(selector, type);
    } else {
      toast.info(`Test selector: ${selector}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Selector Manager
        </CardTitle>
        <CardDescription>
          Define CSS or XPath selectors for data extraction
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border p-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">Field Name</Label>
              <Input
                id="name"
                placeholder="e.g., Price, Brand, Title"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type" className="text-xs">Type</Label>
              <Select value={newType} onValueChange={(v: 'css' | 'xpath') => setNewType(v)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="css">CSS</SelectItem>
                  <SelectItem value="xpath">XPath</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="selector" className="text-xs">Selector</Label>
            <Input
              id="selector"
              placeholder={newType === 'css' ? '.price-value, #product-price' : '//span[@class="price"]'}
              value={newSelector}
              onChange={(e) => setNewSelector(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="attribute" className="text-xs">Attribute (optional)</Label>
              <Input
                id="attribute"
                placeholder="href, src, data-value"
                value={newAttribute}
                onChange={(e) => setNewAttribute(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd} size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-1" />
                Add Selector
              </Button>
            </div>
          </div>
        </div>

        {selectors.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-gray-600">Defined Selectors ({selectors.length})</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectors.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-2 rounded border p-2 bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{entry.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {entry.type.toUpperCase()}
                      </Badge>
                      {entry.attribute && (
                        <Badge variant="secondary" className="text-[10px]">
                          @{entry.attribute}
                        </Badge>
                      )}
                    </div>
                    <code className="text-xs font-mono text-gray-600 break-all">
                      {entry.selector}
                    </code>
                  </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTest(entry.selector, entry.type)}
                        aria-label="Test selector"
                      >
                        <TestTube2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy(entry.selector, entry.id)}
                        aria-label="Copy selector"
                      >
                        {copiedId === entry.id ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => handleRemove(entry.id)}
                        aria-label="Remove selector"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectors.length === 0 && (
          <p className="text-sm text-gray-600 text-center py-4">
            No selectors defined. Add your first selector above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
