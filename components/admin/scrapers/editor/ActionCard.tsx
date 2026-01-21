'use client';

import React from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { WorkflowStep, ActionType } from '@/lib/admin/scrapers/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ActionCardProps {
  step: WorkflowStep;
  index: number;
  id: string;
}

// Helper to render param fields based on action type
function ActionParams({ step, index }: { step: WorkflowStep; index: number }) {
  const { updateWorkflowStep, config } = useScraperEditorStore();
  const params = step.params || {};

  const updateParam = (key: string, value: string | number | boolean) => {
    updateWorkflowStep(index, { params: { ...params, [key]: value } });
  };

  switch (step.action) {
    case 'navigate':
      return (
        <div className="space-y-2">
          <Label>URL</Label>
          <Input
            value={params.url as string || ''}
            onChange={(e) => updateParam('url', e.target.value)}
            placeholder="https://..."
          />
        </div>
      );

    case 'click':
    case 'wait_for':
    case 'conditional_click':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selector</Label>
            <Input
              value={params.selector as string || ''}
              onChange={(e) => updateParam('selector', e.target.value)}
              className="font-mono"
            />
          </div>
          {step.action === 'wait_for' && (
            <div className="space-y-2">
              <Label>Timeout (sec)</Label>
              <Input
                type="number"
                value={params.timeout as number || 10}
                onChange={(e) => updateParam('timeout', parseInt(e.target.value))}
              />
            </div>
          )}
        </div>
      );

    case 'wait':
      return (
        <div className="space-y-2">
          <Label>Seconds</Label>
          <Input
            type="number"
            value={params.seconds as number || 2}
            onChange={(e) => updateParam('seconds', parseInt(e.target.value))}
          />
        </div>
      );

    case 'input_text':
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selector</Label>
            <Input
              value={params.selector as string || ''}
              onChange={(e) => updateParam('selector', e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Text to Type</Label>
            <Input
              value={params.text as string || ''}
              onChange={(e) => updateParam('text', e.target.value)}
            />
          </div>
        </div>
      );

    case 'extract_and_transform':
      return (
        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-md text-sm">
            <p className="mb-2"><strong>Fields to Extract:</strong></p>
            {config.selectors.length === 0 ? (
              <p className="text-muted-foreground italic">No selectors defined. Go to the Selectors tab to add some.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {config.selectors.map(sel => (
                  <div key={sel.name} className="flex items-center gap-2 p-2 bg-background border rounded">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="font-mono text-xs">{sel.name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">This action will automatically use all defined selectors.</p>
          </div>
        </div>
      );

    default:
      return (
        <div className="space-y-2">
          <Label>Parameters (JSON)</Label>
          <Textarea
            value={JSON.stringify(params, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                updateWorkflowStep(index, { params: parsed });
              } catch (e) {
                // Allow invalid JSON while typing
              }
            }}
            className="font-mono text-xs h-24"
          />
        </div>
      );
  }
}

export function ActionCard({ step, index, id }: ActionCardProps) {
  const { updateWorkflowStep, removeWorkflowStep } = useScraperEditorStore();
  const [isOpen, setIsOpen] = React.useState(true);
  const [isEditingName, setIsEditingName] = React.useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWorkflowStep(index, { name: e.target.value });
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-l-4 border-l-primary/50 hover:border-l-primary transition-all">
          <CardHeader className="p-3 pb-2 flex flex-row items-center space-y-0 gap-3">
            <div {...attributes} {...listeners} className="cursor-grab hover:text-primary transition-colors">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="flex-1 flex items-center gap-2">
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-semibold">
                {step.action.replace(/_/g, ' ')}
              </Badge>

              {isEditingName ? (
                <Input
                  value={step.name || ''}
                  onChange={handleNameChange}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                  className="h-7 text-sm max-w-[200px]"
                  autoFocus
                  placeholder="Step Name"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="flex items-center gap-2 group/name cursor-pointer py-1 px-1.5 rounded hover:bg-muted/50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                  title="Click to rename step"
                >
                  <span className="text-sm font-medium text-muted-foreground group-hover/name:text-foreground transition-colors">
                    {step.name || `Step ${index + 1}`}
                  </span>
                  <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
                </div>
              )}
            </div>

              <div className="flex items-center gap-1">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Toggle expand">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => removeWorkflowStep(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="p-3 pt-0 pl-11">
              <div className="pt-2 border-t mt-2">
                <ActionParams step={step} index={index} />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
