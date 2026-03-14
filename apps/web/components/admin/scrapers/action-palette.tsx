'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { actionCategories, actionDefinitions } from '@/lib/admin/scrapers/action-definitions';
import { Search, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

declare global {
  interface Window {
    __addWorkflowStep?: (actionType: string) => void;
  }
}

interface ActionPaletteProps {
  isReadOnly?: boolean;
}

export function ActionPalette({ isReadOnly = false }: ActionPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddAction = (actionType: string) => {
    // We attached this to window in WorkflowStepEditor. 
    // This is a temporary hack to communicate between sibling components without context.
    if (typeof window !== 'undefined' && window.__addWorkflowStep) {
      window.__addWorkflowStep(actionType);
    }
  };

  // Filter actions based on search
  const filteredCategories = Object.entries(actionCategories).map(([catKey, category]) => {
    const filteredActions = category.actions.filter(actionKey => {
      const def = actionDefinitions[actionKey as keyof typeof actionDefinitions];
      const searchLower = searchQuery.toLowerCase();
      return (
        actionKey.toLowerCase().includes(searchLower) ||
        def.label.toLowerCase().includes(searchLower) ||
        def.description.toLowerCase().includes(searchLower)
      );
    });

    return {
      key: catKey,
      ...category,
      actions: filteredActions
    };
  }).filter(category => category.actions.length > 0);

  return (
    <Card className="border-border h-full flex flex-col sticky top-4">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-lg">Action Palette</CardTitle>
        <CardDescription>Click to add to workflow</CardDescription>
        <div className="pt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search actions..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[calc(100vh-280px)] px-6 pb-6">
          <div className="space-y-6">
            {filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No actions match your search.
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category.key} className="space-y-3">
                  <h4 className="text-sm font-semibold tracking-tight text-foreground/80 flex items-center gap-2">
                    {category.label}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {category.actions.map((actionKey) => {
                      const def = actionDefinitions[actionKey as keyof typeof actionDefinitions];
                      return (
                        <button
                          key={actionKey}
                          onClick={() => handleAddAction(actionKey)}
                          disabled={isReadOnly}
                          className="flex flex-col items-start p-3 text-left border rounded-md hover:border-primary/50 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={`text-sm font-medium text-${def.color}-600 dark:text-${def.color}-400`}>
                              {def.label}
                            </span>
                            <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {def.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
