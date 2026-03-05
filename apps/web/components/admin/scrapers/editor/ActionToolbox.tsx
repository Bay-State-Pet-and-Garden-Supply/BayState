'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { 
  Globe, MousePointer, Clock, Search, Type, 
  CheckCircle, ArrowDown, Code, LogIn,
  SkipForward, GitBranch
} from 'lucide-react';
import { ActionType } from '@/lib/admin/scrapers/types';

interface ActionItemProps {
  actionType: ActionType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

// Action configuration
const ACTIONS: ActionItemProps[] = [
  // Navigation
  { actionType: 'navigate', label: 'Navigate', description: 'Go to a specific URL', icon: <Globe className="h-4 w-4" />, color: '#348C41' },
  { actionType: 'scroll', label: 'Scroll', description: 'Scroll up or down', icon: <ArrowDown className="h-4 w-4" />, color: '#06B6D4' },
  // Interaction
  { actionType: 'click', label: 'Click', description: 'Click an element', icon: <MousePointer className="h-4 w-4" />, color: '#3B82F6' },
  { actionType: 'input_text', label: 'Input Text', description: 'Type into a field', icon: <Type className="h-4 w-4" />, color: '#EC4899' },
  { actionType: 'conditional_click', label: 'Conditional Click', description: 'Click if element exists', icon: <MousePointer className="h-4 w-4" />, color: '#6366F1' },
  // Waiting
  { actionType: 'wait', label: 'Wait', description: 'Fixed delay', icon: <Clock className="h-4 w-4" />, color: '#F59E0B' },
  { actionType: 'wait_for', label: 'Wait For Element', description: 'Wait until element appears', icon: <Search className="h-4 w-4" />, color: '#8B5CF6' },
  // Extraction
  { actionType: 'extract_and_transform', label: 'Extract Data', description: 'Get data from page', icon: <Search className="h-4 w-4" />, color: '#14B8A6' },
  { actionType: 'check_no_results', label: 'Check No Results', description: 'Detect empty results', icon: <CheckCircle className="h-4 w-4" />, color: '#EF4444' },
  // Flow Control
  { actionType: 'conditional_skip', label: 'Conditional Skip', description: 'Skip steps conditionally', icon: <SkipForward className="h-4 w-4" />, color: '#78716C' },
  { actionType: 'conditional', label: 'Conditional', description: 'Branch logic', icon: <GitBranch className="h-4 w-4" />, color: '#A855F7' },
  // Advanced
  { actionType: 'login', label: 'Login', description: 'Authenticate with site', icon: <LogIn className="h-4 w-4" />, color: '#66161D' },
  { actionType: 'verify', label: 'Verify', description: 'Assert page content', icon: <CheckCircle className="h-4 w-4" />, color: '#22C55E' },
  { actionType: 'execute_script', label: 'Execute Script', description: 'Run custom JS', icon: <Code className="h-4 w-4" />, color: '#64748B' },
];

const CATEGORIES = [
  { name: 'Navigation', types: ['navigate', 'scroll'] },
  { name: 'Interaction', types: ['click', 'input_text', 'conditional_click'] },
  { name: 'Waiting & Timing', types: ['wait', 'wait_for'] },
  { name: 'Extraction', types: ['extract_and_transform', 'check_no_results'] },
  { name: 'Flow Control', types: ['conditional_skip', 'conditional'] },
  { name: 'Advanced', types: ['login', 'verify', 'execute_script'] },
];

function DraggableActionItem({ actionType, label, description, icon, color }: ActionItemProps) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow-action', actionType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="cursor-grab active:cursor-grabbing"
    >
      <Card className="p-3 hover:bg-accent/50 transition-all border-dashed hover:border-solid hover:shadow-md group">
        <div className="flex items-center gap-3">
          <div 
            className="p-2 rounded-md transition-colors"
            style={{ 
              backgroundColor: `${color}15`,
              color: color 
            }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{label}</div>
            <div className="text-xs text-muted-foreground truncate">{description}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ActionToolbox() {
  return (
    <div className="w-72 border-r h-full flex flex-col bg-background shrink-0">
      <div className="p-4 border-b bg-muted/20 shrink-0">
        <h3 className="font-semibold mb-1">Action Toolbox</h3>
        <p className="text-xs text-muted-foreground">Drag actions onto the canvas</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {CATEGORIES.map((category) => (
          <div key={category.name} className="space-y-2">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {category.name}
            </h4>
            <div className="space-y-1.5">
              {ACTIONS.filter(a => category.types.includes(a.actionType)).map((action) => (
                <DraggableActionItem key={action.actionType} {...action} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
