'use client';

import { useMemo } from 'react';
import { X, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

import { WorkflowStep, ActionType, ActionParamDefinition } from '@/lib/admin/scrapers/types';
import { actionDefinitions } from '@/lib/admin/scrapers/action-definitions';

interface StepEditorPanelProps {
  step: WorkflowStep;
  nodeId: string;
  onUpdate: (nodeId: string, step: WorkflowStep) => void;
  onClose: () => void;
}

export function StepEditorPanel({ step, nodeId, onUpdate, onClose }: StepEditorPanelProps) {
  const actionType = step.action as ActionType;
  const definition = actionDefinitions[actionType];

  const paramEntries = useMemo(() => {
    if (!definition?.params) return [];
    return Object.entries(definition.params);
  }, [definition]);

  if (!definition) {
    return (
      <div className="w-80 border-l bg-white p-4">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 hover:bg-gray-100" aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
        <p className="text-sm text-gray-600">
          Action type &quot;{step.action}&quot; is not recognized.
        </p>
      </div>
    );
  }

  const handleParamChange = (paramKey: string, value: unknown) => {
    const updatedStep: WorkflowStep = {
      ...step,
      [paramKey]: value,
    };
    onUpdate(nodeId, updatedStep);
  };

  const renderParam = (paramKey: string, paramDef: ActionParamDefinition) => {
    const currentValue = step[paramKey as keyof WorkflowStep];

    // Handle different param types
    switch (paramDef.type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between" key={paramKey}>
            <div className="flex items-center gap-2">
              <Label htmlFor={paramKey} className="text-sm">
                {paramDef.label}
              </Label>
              {paramDef.description && (
                <ParamTooltip description={paramDef.description} />
              )}
            </div>
            <Switch
              id={paramKey}
              checked={Boolean(currentValue ?? paramDef.default)}
              onCheckedChange={(checked: boolean) => handleParamChange(paramKey, checked)}
            />
          </div>
        );

      case 'number':
        return (
          <div className="space-y-1.5" key={paramKey}>
            <div className="flex items-center gap-2">
              <Label htmlFor={paramKey} className="text-sm">
                {paramDef.label}
                {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {paramDef.description && (
                <ParamTooltip description={paramDef.description} />
              )}
            </div>
            <Input
              id={paramKey}
              type="number"
              value={String(currentValue ?? paramDef.default ?? '')}
              onChange={(e) => handleParamChange(paramKey, e.target.value ? Number(e.target.value) : undefined)}
              placeholder={paramDef.placeholder}
              className="h-8"
            />
          </div>
        );

      case 'string':
      case 'selector':
        if (paramDef.options && paramDef.options.length > 0) {
          // Render as select dropdown
          return (
            <div className="space-y-1.5" key={paramKey}>
              <div className="flex items-center gap-2">
                <Label htmlFor={paramKey} className="text-sm">
                  {paramDef.label}
                  {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                {paramDef.description && (
                  <ParamTooltip description={paramDef.description} />
                )}
              </div>
              <Select
                value={String(currentValue ?? paramDef.default ?? '')}
                onValueChange={(value) => handleParamChange(paramKey, value)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={`Select ${paramDef.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {paramDef.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        // Long text fields use textarea
        const isLongText = paramKey === 'script' || paramKey === 'url';
        if (isLongText) {
          return (
            <div className="space-y-1.5" key={paramKey}>
              <div className="flex items-center gap-2">
                <Label htmlFor={paramKey} className="text-sm">
                  {paramDef.label}
                  {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                {paramDef.description && (
                  <ParamTooltip description={paramDef.description} />
                )}
              </div>
              <Textarea
                id={paramKey}
                value={String(currentValue ?? '')}
                onChange={(e) => handleParamChange(paramKey, e.target.value)}
                placeholder={paramDef.placeholder}
                className="min-h-[80px] font-mono text-xs"
              />
            </div>
          );
        }

        // Standard text input
        return (
          <div className="space-y-1.5" key={paramKey}>
            <div className="flex items-center gap-2">
              <Label htmlFor={paramKey} className="text-sm">
                {paramDef.label}
                {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {paramDef.description && (
                <ParamTooltip description={paramDef.description} />
              )}
            </div>
            <Input
              id={paramKey}
              type="text"
              value={String(currentValue ?? '')}
              onChange={(e) => handleParamChange(paramKey, e.target.value)}
              placeholder={paramDef.placeholder}
              className="h-8"
            />
          </div>
        );

      case 'array':
      case 'object':
        // For complex types, show a JSON textarea
        return (
          <div className="space-y-1.5" key={paramKey}>
            <div className="flex items-center gap-2">
              <Label htmlFor={paramKey} className="text-sm">
                {paramDef.label}
                {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {paramDef.description && (
                <ParamTooltip description={paramDef.description} />
              )}
              <Badge variant="outline" className="text-[10px]">JSON</Badge>
            </div>
            <Textarea
              id={paramKey}
              value={
                currentValue !== undefined
                  ? typeof currentValue === 'string'
                    ? currentValue
                    : JSON.stringify(currentValue, null, 2)
                  : ''
              }
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  handleParamChange(paramKey, parsed);
                } catch {
                  // Keep raw value if invalid JSON (user may still be typing)
                  handleParamChange(paramKey, e.target.value);
                }
              }}
              placeholder={`Enter ${paramDef.label.toLowerCase()} as JSON`}
              className="min-h-[80px] font-mono text-xs"
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h3 className="font-semibold text-sm">{definition.label}</h3>
          <p className="text-xs text-gray-600">{definition.description}</p>
        </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
      </div>

      {/* Metadata badges */}
      <div className="flex gap-2 px-4 py-2 border-b">
        <Badge
          variant="outline"
          className={definition.browserBound ? 'border-blue-200 text-blue-700' : 'border-gray-200'}
        >
          {definition.browserBound ? 'Browser' : 'Local'}
        </Badge>
        <Badge variant="outline" className="border-gray-200 capitalize">
          {definition.category}
        </Badge>
      </div>

      {/* Parameters */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {paramEntries.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <AlertCircle className="h-4 w-4" />
              <span>This action has no configurable parameters.</span>
            </div>
          ) : (
            <>
              {/* Required params first */}
              {paramEntries
                .filter(([, def]) => def.required)
                .map(([key, def]) => renderParam(key, def))}

              {/* Separator if we have both required and optional */}
              {paramEntries.some(([, def]) => def.required) &&
                paramEntries.some(([, def]) => !def.required) && (
                  <Separator className="my-2" />
                )}

              {/* Optional params */}
              {paramEntries
                .filter(([, def]) => !def.required)
                .map(([key, def]) => renderParam(key, def))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t px-4 py-3 bg-gray-50">
        <p className="text-[10px] text-gray-600">
          Node: {nodeId} | Action: {step.action}
        </p>
      </div>
    </div>
  );
}

function ParamTooltip({ description }: { description: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-gray-600 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px]">
          <p className="text-xs">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
