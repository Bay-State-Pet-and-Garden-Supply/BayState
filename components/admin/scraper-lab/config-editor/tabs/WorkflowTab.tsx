'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Trash2, Plus, ArrowDown, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { actionTypes } from '@/lib/admin/scrapers/schema';

// Helper to get color for action type
const getActionColor = (type: string) => {
  switch (type) {
    case 'navigate': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'extract': 
    case 'extract_and_transform': return 'bg-green-100 text-green-800 border-green-200';
    case 'click': 
    case 'input_text': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'wait': 
    case 'wait_for': return 'bg-gray-100 text-gray-800 border-gray-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

export function WorkflowTab() {
  const { control, watch } = useFormContext<ScraperConfig>();
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'workflows',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Steps</h2>
          <p className="text-sm text-muted-foreground">
            Define the sequence of actions the scraper will execute.
          </p>
        </div>
        <Button 
          onClick={() => append({ 
            action: 'wait', 
            name: '', 
            params: {} 
          })}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Step
        </Button>
      </div>

      <div className="space-y-2 relative">
         {/* Vertical connector line */}
         {fields.length > 1 && (
            <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-border -z-10" />
         )}

        {fields.length === 0 && (
          <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">No workflow steps defined.</p>
            <Button 
              variant="link" 
              onClick={() => append({ action: 'navigate', name: 'Start', params: { url: '' } })}
            >
              Add initial navigation
            </Button>
          </div>
        )}

        {fields.map((field, index) => {
           const actionType = watch(`workflows.${index}.action`);

           return (
            <Card key={field.id} className="relative group transition-all hover:shadow-md border-l-4 border-l-primary/20 hover:border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Step Number */}
                  <div className="flex-none flex flex-col items-center gap-1 mt-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-mono text-sm font-bold border">
                      {index + 1}
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-12 gap-4">
                      
                      <div className="col-span-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.action`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Action Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="font-medium">
                                    <SelectValue placeholder="Select action..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-[300px]">
                                  {actionTypes.map(type => (
                                    <SelectItem key={type} value={type}>
                                      {type.replace(/_/g, ' ')}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="col-span-8">
                         {/* Dynamic Params based on action type */}
                         {/* This is a simplified version. Ideally we'd have sub-components for each action type params */}
                         {/* For MVP, we just show a raw JSON editor or specific common fields */}
                         
                         {actionType === 'navigate' && (
                           <FormField
                            control={control}
                            name={`workflows.${index}.params.url`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Target URL</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://..." {...field} value={field.value as string || ''} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                         )}

                         {(actionType === 'click' || actionType === 'wait_for' || actionType === 'input_text') && (
                           <FormField
                            control={control}
                            name={`workflows.${index}.params.selector`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Target Selector</FormLabel>
                                <FormControl>
                                  <Input placeholder=".class or #id" className="font-mono" {...field} value={field.value as string || ''} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                         )}

                         {actionType === 'input_text' && (
                           <div className="mt-2">
                            <FormField
                              control={control}
                              name={`workflows.${index}.params.text`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Input Text</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Value to type..." {...field} value={field.value as string || ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                           </div>
                         )}

                         {actionType === 'wait' && (
                           <FormField
                            control={control}
                            name={`workflows.${index}.params.seconds`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Seconds</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={e => field.onChange(parseFloat(e.target.value))}
                                    value={field.value as number || 0} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                         )}
                         
                         {/* Fallback for complex/other types - simple hint */}
                         {!['navigate', 'click', 'wait_for', 'input_text', 'wait'].includes(actionType) && (
                            <div className="flex items-center h-full text-muted-foreground text-sm italic border rounded px-3 bg-muted/50">
                               <Settings2 className="w-4 h-4 mr-2" />
                               Params for {actionType} configured in JSON preview (for now)
                            </div>
                         )}
                      </div>

                      <div className="col-span-1 flex justify-end items-start pt-8">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
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
