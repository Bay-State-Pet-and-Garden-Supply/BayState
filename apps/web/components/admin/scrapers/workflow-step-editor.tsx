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
import { Badge } from '@/components/ui/badge';
import { GripVertical, Trash2, Save, Undo, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { 
  addWorkflowStep, 
  updateWorkflowStep, 
  deleteWorkflowStep, 
  reorderWorkflowSteps 
} from '@/lib/admin/scraper-configs/actions-normalized';
import { ScraperWorkflowStep, ActionType } from '@/lib/admin/scrapers/types';
import { actionDefinitions } from '@/lib/admin/scrapers/action-definitions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface WorkflowStepEditorProps {
  versionId: string;
  steps: ScraperWorkflowStep[];
  isReadOnly?: boolean;
}

// Draggable Item Component
function SortableStepItem({ 
  step, 
  isReadOnly, 
  onUpdate, 
  onDelete,
  onUpdateParams,
  index
}: { 
  step: ScraperWorkflowStep; 
  isReadOnly: boolean; 
  onUpdate: (id: string, field: string, value: any) => void;
  onUpdateParams: (id: string, params: Record<string, any>) => void;
  onDelete: (id: string) => void;
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const actionDef = actionDefinitions[step.action as ActionType];
  const [paramsJson, setParamsJson] = useState(JSON.stringify(step.params || {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id, disabled: isReadOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  const handleParamsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setParamsJson(newVal);
    try {
      const parsed = JSON.parse(newVal);
      setJsonError(null);
      onUpdateParams(step.id, parsed);
    } catch (err) {
      setJsonError('Invalid JSON');
    }
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex flex-col border rounded-md bg-card mb-3 shadow-sm ${isReadOnly ? 'opacity-80' : ''} ${isDragging ? 'shadow-md ring-1 ring-primary/20' : ''}`}
    >
      {/* Header (Always visible) */}
      <div className="flex items-center gap-3 p-3">
        {!isReadOnly && (
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-5 w-5" />
          </div>
        )}
        
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {index + 1}
        </div>
        
        <div className="flex-1 flex items-center gap-3 overflow-hidden">
          <Badge variant="outline" className={`bg-${actionDef?.color || 'gray'}-500/10 text-${actionDef?.color || 'gray'}-500 border-${actionDef?.color || 'gray'}-500/20 whitespace-nowrap`}>
            {actionDef?.label || step.action}
          </Badge>
          
          <div className="truncate text-sm font-medium">
            {step.name || actionDef?.description || step.action}
          </div>
          
          <div className="truncate text-xs text-muted-foreground ml-auto hidden sm:block">
            {Object.keys(step.params || {}).length} params
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          {!isReadOnly && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => onDelete(step.id)}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-0 border-t bg-muted/10 space-y-4">
          <div className="grid gap-4 mt-4">
            <div className="grid gap-2">
              <Label htmlFor={`name-${step.id}`}>Step Name (Optional)</Label>
              <Input 
                id={`name-${step.id}`}
                value={step.name || ''} 
                onChange={(e) => onUpdate(step.id, 'name', e.target.value)}
                disabled={isReadOnly}
                placeholder={`e.g. ${actionDef?.label || 'Custom Step'}`}
              />
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`params-${step.id}`}>Parameters (JSON)</Label>
                {jsonError && <span className="text-xs text-destructive">{jsonError}</span>}
              </div>
              <Textarea 
                id={`params-${step.id}`}
                value={paramsJson}
                onChange={handleParamsChange}
                disabled={isReadOnly}
                className={`font-mono text-sm min-h-[150px] ${jsonError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              />
              {actionDef?.params && Object.keys(actionDef.params).length > 0 && (
                 <div className="text-xs text-muted-foreground">
                   Available params: {Object.keys(actionDef.params).join(', ')}
                 </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkflowStepEditor({ versionId, steps: initialSteps, isReadOnly = false }: WorkflowStepEditorProps) {
  const [items, setItems] = useState<ScraperWorkflowStep[]>(initialSteps);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      }
    }),
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

  const handleUpdate = (id: string, field: string, value: any) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
    setHasChanges(true);
  };

  const handleUpdateParams = (id: string, params: Record<string, any>) => {
     setItems(items.map(item => 
      item.id === id ? { ...item, params } : item
    ));
    setHasChanges(true);
  }

  const handleDelete = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    setHasChanges(true);
  };

  // Expose this method so the parent (ActionPalette) can call it
  const handleAddStep = (actionType: string) => {
    const newId = `new-${Date.now()}`;
    const def = actionDefinitions[actionType as ActionType];
    
    // Auto-generate default params based on schema
    const defaultParams: Record<string, any> = {};
    if (def && def.params) {
      Object.entries(def.params).forEach(([key, paramDef]) => {
        if (paramDef.default !== undefined) {
          defaultParams[key] = paramDef.default;
        } else if (paramDef.type === 'boolean') {
           defaultParams[key] = false;
        } else if (paramDef.type === 'number') {
           defaultParams[key] = 0;
        } else if (paramDef.type === 'array') {
           defaultParams[key] = [];
        } else if (paramDef.type === 'object') {
           defaultParams[key] = {};
        } else {
           defaultParams[key] = '';
        }
      });
    }

    setItems([
      ...items,
      {
        id: newId,
        version_id: versionId,
        action: actionType,
        name: '',
        params: defaultParams,
        sort_order: items.length,
        created_at: new Date().toISOString(),
      } as unknown as ScraperWorkflowStep // Type assertion because we omit some fields locally
    ]);
    setHasChanges(true);
  };

  // Expose handleAddStep to window so ActionPalette can use it (hacky but works without React context for now)
  // Better approach would be passing it via props from a common parent
  if (typeof window !== 'undefined') {
    (window as any).__addWorkflowStep = handleAddStep;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Process deletions
      const initialIds = new Set(initialSteps.map(i => i.id));
      const currentIds = new Set(items.map(i => i.id));
      
      for (const id of initialIds) {
        if (!currentIds.has(id)) {
          await deleteWorkflowStep(id);
        }
      }
      
      // 2. Process updates and insertions
      const savedIds: string[] = [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.id.startsWith('new-')) {
          // Insert
          await addWorkflowStep(versionId, {
            action: item.action,
            name: item.name || undefined,
            params: item.params,
          });
        } else {
          // Update
          await updateWorkflowStep(item.id, {
            action: item.action,
            name: item.name || undefined,
            params: item.params,
          });
          savedIds.push(item.id);
        }
      }
      
      // 3. Process reordering for existing items
      if (savedIds.length > 0) {
        await reorderWorkflowSteps(versionId, savedIds);
      }
      
      setHasChanges(false);
      window.location.reload();
      
    } catch (error) {
      console.error('Failed to save workflow steps:', error);
      alert('Failed to save changes. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setItems(initialSteps);
    setHasChanges(false);
  };

  return (
    <Card className="border-border" data-testid="workflow-step-editor">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-xl">Workflow Steps</CardTitle>
          <CardDescription>
            Define the sequence of actions to perform. Drag to reorder.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed bg-muted/20">
            <Settings className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
            <p className="text-muted-foreground mb-2">No workflow steps defined.</p>
            <p className="text-sm text-muted-foreground">Select an action from the palette to get started.</p>
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
              <div className="space-y-1" data-testid="workflow-steps-list">
                {items.map((step, index) => (
                  <SortableStepItem 
                    key={step.id} 
                    step={step} 
                    index={index}
                    isReadOnly={isReadOnly}
                    onUpdate={handleUpdate}
                    onUpdateParams={handleUpdateParams}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
      {hasChanges && !isReadOnly && (
        <CardFooter className="flex justify-between border-t bg-muted/20 pt-4 sticky bottom-0 z-10 backdrop-blur-md">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={isSaving}>
              <Undo className="mr-2 h-4 w-4" />
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Workflow'}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
