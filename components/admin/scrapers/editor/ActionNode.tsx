'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { 
  Globe, MousePointer, Clock, Search, Type, 
  CheckCircle, ArrowDown, Code, Image, Combine,
  Scale, FileJson, SkipForward, GitBranch, LogIn
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ActionNodeData } from '@/lib/admin/scrapers/types';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';

// Action type to icon/color mapping
const actionConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  navigate: { icon: Globe, color: '#348C41', bgColor: 'bg-green-50 dark:bg-green-950' },
  click: { icon: MousePointer, color: '#3B82F6', bgColor: 'bg-blue-50 dark:bg-blue-950' },
  wait: { icon: Clock, color: '#F59E0B', bgColor: 'bg-amber-50 dark:bg-amber-950' },
  wait_for: { icon: Search, color: '#8B5CF6', bgColor: 'bg-violet-50 dark:bg-violet-950' },
  input_text: { icon: Type, color: '#EC4899', bgColor: 'bg-pink-50 dark:bg-pink-950' },
  conditional_click: { icon: MousePointer, color: '#6366F1', bgColor: 'bg-indigo-50 dark:bg-indigo-950' },
  extract: { icon: Search, color: '#10B981', bgColor: 'bg-emerald-50 dark:bg-emerald-950' },
  extract_and_transform: { icon: Search, color: '#14B8A6', bgColor: 'bg-teal-50 dark:bg-teal-950' },
  transform_value: { icon: Code, color: '#F97316', bgColor: 'bg-orange-50 dark:bg-orange-950' },
  check_no_results: { icon: CheckCircle, color: '#EF4444', bgColor: 'bg-red-50 dark:bg-red-950' },
  conditional_skip: { icon: SkipForward, color: '#78716C', bgColor: 'bg-stone-50 dark:bg-stone-950' },
  conditional: { icon: GitBranch, color: '#A855F7', bgColor: 'bg-purple-50 dark:bg-purple-950' },
  scroll: { icon: ArrowDown, color: '#06B6D4', bgColor: 'bg-cyan-50 dark:bg-cyan-950' },
  verify: { icon: CheckCircle, color: '#22C55E', bgColor: 'bg-green-50 dark:bg-green-950' },
  login: { icon: LogIn, color: '#66161D', bgColor: 'bg-red-50 dark:bg-red-950' },
  execute_script: { icon: Code, color: '#64748B', bgColor: 'bg-slate-50 dark:bg-slate-950' },
  process_images: { icon: Image, color: '#0EA5E9', bgColor: 'bg-sky-50 dark:bg-sky-950' },
  combine_fields: { icon: Combine, color: '#D946EF', bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-950' },
  parse_weight: { icon: Scale, color: '#84CC16', bgColor: 'bg-lime-50 dark:bg-lime-950' },
  extract_from_json: { icon: FileJson, color: '#FCD048', bgColor: 'bg-yellow-50 dark:bg-yellow-950' },
};

const defaultConfig = { icon: Code, color: '#6B7280', bgColor: 'bg-gray-50 dark:bg-gray-950' };

// Parameter editor component
function ActionParams({ step, index }: { step: { action: string; params?: Record<string, unknown> }; index: number }) {
  const { updateWorkflowStep, config } = useScraperEditorStore();
  const params = step.params || {};

  const updateParam = (key: string, value: unknown) => {
    updateWorkflowStep(index, { params: { ...params, [key]: value } });
  };

  switch (step.action) {
    case 'navigate':
      return (
        <div className="space-y-2">
          <Label className="text-xs">URL</Label>
          <Input 
            value={params.url as string || ''} 
            onChange={(e) => updateParam('url', e.target.value)} 
            placeholder="https://..." 
            className="h-8 text-xs"
          />
        </div>
      );
    
    case 'click':
    case 'wait_for':
    case 'conditional_click':
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Selector</Label>
            <Input 
              value={params.selector as string || ''} 
              onChange={(e) => updateParam('selector', e.target.value)} 
              className="font-mono h-8 text-xs"
            />
          </div>
          {step.action === 'wait_for' && (
            <div className="space-y-1">
              <Label className="text-xs">Timeout (sec)</Label>
              <Input 
                type="number"
                value={params.timeout as number || 10} 
                onChange={(e) => updateParam('timeout', parseInt(e.target.value))} 
                className="h-8 text-xs w-20"
              />
            </div>
          )}
        </div>
      );

    case 'wait':
      return (
        <div className="space-y-1">
          <Label className="text-xs">Seconds</Label>
          <Input 
            type="number"
            value={params.seconds as number || 2} 
            onChange={(e) => updateParam('seconds', parseInt(e.target.value))} 
            className="h-8 text-xs w-20"
          />
        </div>
      );
      
    case 'input_text':
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Selector</Label>
            <Input 
              value={params.selector as string || ''} 
              onChange={(e) => updateParam('selector', e.target.value)} 
              className="font-mono h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Text to Type</Label>
            <Input 
              value={params.text as string || ''} 
              onChange={(e) => updateParam('text', e.target.value)} 
              className="h-8 text-xs"
            />
          </div>
        </div>
      );
      
    case 'extract_and_transform':
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Fields to Extract:</p>
          {config.selectors.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No selectors defined.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {config.selectors.map(sel => (
                <Badge key={sel.name} variant="secondary" className="text-[10px]">
                  {sel.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <Label className="text-xs">Parameters (JSON)</Label>
          <Textarea 
            value={JSON.stringify(params, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                updateWorkflowStep(index, { params: parsed });
              } catch {
                // Allow invalid JSON while typing
              }
            }}
            className="font-mono text-[10px] h-16 resize-none"
          />
        </div>
      );
  }
}

function ActionNodeComponent({ data, selected }: NodeProps<Node<ActionNodeData>>) {
  const { updateWorkflowStep, removeWorkflowStep } = useScraperEditorStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  const config = actionConfig[data.actionType] || defaultConfig;
  const IconComponent = config.icon;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWorkflowStep(data.index, { name: e.target.value });
  };

  return (
    <div className="relative">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background"
      />

      <Card 
        className={`min-w-[220px] max-w-[280px] shadow-lg transition-all duration-200 ${config.bgColor} ${
          selected ? 'ring-2 ring-primary ring-offset-2' : ''
        }`}
      >
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center gap-2">
              <div 
                className="p-1.5 rounded-md"
                style={{ backgroundColor: `${config.color}20` }}
              >
                <IconComponent 
                  className="h-4 w-4" 
                  style={{ color: config.color }} 
                />
              </div>
              
              <div className="flex-1 min-w-0">
                <Badge 
                  variant="outline" 
                  className="text-[9px] tracking-wider font-semibold mb-1"
                  style={{ borderColor: config.color, color: config.color }}
                >
                  {data.actionType.replace(/_/g, ' ').toUpperCase()}
                </Badge>
                
                {isEditingName ? (
                  <Input 
                    value={data.step.name || ''} 
                    onChange={handleNameChange}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                    className="h-6 text-xs"
                    autoFocus
                    placeholder="Step Name"
                  />
                ) : (
                  <div 
                    className="flex items-center gap-1 cursor-pointer group/name"
                    onClick={() => setIsEditingName(true)}
                  >
                    <span className="text-xs font-medium truncate">
                      {data.label}
                    </span>
                    <Edit2 className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/name:opacity-100" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Toggle expand">
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removeWorkflowStep(data.index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CollapsibleContent>
            <CardContent className="p-3 pt-0 border-t">
              <div className="pt-2">
                <ActionParams step={data.step} index={data.index} />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
