'use client';

import { useState } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, GripVertical, Trash2, Save, Undo } from 'lucide-react';
import { 
  addSelector, 
  updateSelector, 
  deleteSelector, 
  reorderSelectors 
} from '@/lib/admin/scraper-configs/actions-normalized';
import { ScraperSelector } from '@/lib/admin/scrapers/types';

interface SelectorEditorProps {
  versionId: string;
  selectors: ScraperSelector[];
  isReadOnly?: boolean;
  versionStatus?: string | null;
}

// Draggable Item Component
function SortableSelectorItem({ 
  selector, 
  isReadOnly, 
  onUpdate, 
  onDelete 
}: { 
  selector: ScraperSelector; 
  isReadOnly: boolean; 
  onUpdate: (id: string, field: string, value: string | boolean) => void; 
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: selector.id, disabled: isReadOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex items-start gap-3 p-4 border rounded-md bg-card ${isReadOnly ? 'opacity-80' : ''}`}
      data-testid="selector-item"
    >
      {!isReadOnly && (
        <div 
          {...attributes} 
          {...listeners} 
          className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-5 w-5" />
        </div>
      )}
      
      <div className="flex-1 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input 
              data-testid="selector-name-input"
              value={selector.name} 
              onChange={(e) => onUpdate(selector.id, 'name', e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. price, title, image"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">CSS Selector / XPath</label>
            <Input 
              value={selector.selector} 
              onChange={(e) => onUpdate(selector.id, 'selector', e.target.value)}
              disabled={isReadOnly}
              placeholder="e.g. .product-price, //h1"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Extract</label>
            <Select 
              value={selector.attribute || 'text'} 
              onValueChange={(value) => onUpdate(selector.id, 'attribute', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="text" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text Content</SelectItem>
                <SelectItem value="html">Inner HTML</SelectItem>
                <SelectItem value="href">href (Link)</SelectItem>
                <SelectItem value="src">src (Image)</SelectItem>
                <SelectItem value="content">content (Meta)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch 
              id={`multiple-${selector.id}`} 
              checked={selector.multiple} 
              onCheckedChange={(checked) => onUpdate(selector.id, 'multiple', checked)}
              disabled={isReadOnly}
            />
            <label htmlFor={`multiple-${selector.id}`} className="text-xs font-medium text-muted-foreground">
              Multiple (List)
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch 
              id={`required-${selector.id}`} 
              checked={selector.required} 
              onCheckedChange={(checked) => onUpdate(selector.id, 'required', checked)}
              disabled={isReadOnly}
            />
            <label htmlFor={`required-${selector.id}`} className="text-xs font-medium text-muted-foreground">
              Required
            </label>
          </div>
        </div>
      </div>
      
      {!isReadOnly && (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => onDelete(selector.id)}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          data-testid="delete-selector-button"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function SelectorEditor({ versionId, selectors: initialSelectors, isReadOnly = false, versionStatus }: SelectorEditorProps) {
  const [items, setItems] = useState<ScraperSelector[]>(initialSelectors);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const handleUpdate = (id: string, field: string, value: string | boolean) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
    setHasChanges(true);
  };

  const handleDelete = (id: string) => {
    // If it's a new item not yet in DB (starts with 'new-')
    if (id.startsWith('new-')) {
      setItems(items.filter(item => item.id !== id));
      return;
    }
    
    // Otherwise mark for deletion or keep track and delete on save
    // For simplicity in this demo, we'll just remove it from state and handle on save
    setItems(items.filter(item => item.id !== id));
    setHasChanges(true);
  };

  const handleAdd = () => {
    const newId = `new-${Date.now()}`;
    setItems([
      ...items,
      {
        id: newId,
        version_id: versionId,
        name: '',
        selector: '',
        attribute: 'text',
        multiple: false,
        required: true,
        sort_order: items.length,
        created_at: new Date().toISOString(),
      }
    ]);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Process deletions (items in initialSelectors but not in items)
      const initialIds = new Set(initialSelectors.map(i => i.id));
      const currentIds = new Set(items.map(i => i.id));
      
      for (const id of initialIds) {
        if (!currentIds.has(id)) {
          await deleteSelector(id);
        }
      }
      
      // 2. Process updates and insertions
      const savedIds: string[] = [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.id.startsWith('new-')) {
          // It's new, insert it
          await addSelector(versionId, {
            name: item.name || `field_${i}`,
            selector: item.selector || 'body',
            attribute: item.attribute,
            multiple: item.multiple,
            required: item.required,
          });
          // We can't get the new ID back easily from the current addSelector action, 
          // but reorderSelectors below will handle it if we just reload
        } else {
          // It's an update
          await updateSelector(item.id, {
            name: item.name,
            selector: item.selector,
            attribute: item.attribute,
            multiple: item.multiple,
            required: item.required,
          });
          savedIds.push(item.id);
        }
      }
      
      // 3. Process reordering for existing items
      if (savedIds.length > 0) {
        await reorderSelectors(versionId, savedIds);
      }
      
      setHasChanges(false);
      // Let the server component re-fetch the true state
      window.location.reload();
      
    } catch (error) {
      console.error('Failed to save selectors:', error);
      alert('Failed to save changes. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setItems(initialSelectors);
    setHasChanges(false);
  };

  return (
    <Card className="border-border" data-testid="selector-editor">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-xl">Data Selectors</CardTitle>
          <CardDescription>
            Define what data to extract from the page. Order matters for display.
          </CardDescription>
        </div>
        {!isReadOnly && (
          <Button onClick={handleAdd} size="sm" variant="outline" className="gap-2" data-testid="add-selector-button">
            <Plus className="h-4 w-4" />
            Add Selector
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed bg-muted/20" data-testid="selectors-empty-state">
            <p className="text-muted-foreground mb-4">No selectors defined for this version.</p>
            {!isReadOnly && (
              <Button onClick={handleAdd} variant="secondary">Create First Selector</Button>
            )}
          </div>
        ) : (
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={items.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3" data-testid="selectors-list">
                {items.map((selector) => (
                  <SortableSelectorItem 
                    key={selector.id} 
                    selector={selector} 
                    isReadOnly={isReadOnly}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
      {hasChanges && !isReadOnly && (
        <CardFooter className="flex justify-between border-t bg-muted/20 pt-4" data-testid="selector-editor-unsaved-footer">
          <p className="text-sm text-muted-foreground">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={isSaving}>
              <Undo className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="save-selectors-button">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Selectors'}
            </Button>
          </div>
        </CardFooter>
      )}
      {isReadOnly && (
        <CardFooter className="flex justify-between border-t bg-muted/20 pt-4" data-testid="selector-editor-readonly-footer">
          <p className="text-sm text-muted-foreground" data-testid="selector-editor-readonly-message">
            Selectors are read-only while the current version is {versionStatus || 'published'}. Create a draft version to make edits.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
