'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function SelectorsTab() {
  const { control } = useFormContext<ScraperConfig>();
  const { fields,append, remove } = useFieldArray({
    control,
    name: 'selectors',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data Selectors</h2>
          <p className="text-sm text-muted-foreground">
            Define CSS selectors to extract data fields from the page.
          </p>
        </div>
        <Button 
          onClick={() => append({ 
            name: '', 
            selector: '', 
            attribute: 'text', 
            multiple: false, 
            required: true 
          })}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Selector
        </Button>
      </div>

      <div className="space-y-4">
        {fields.length === 0 && (
          <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">No selectors defined yet.</p>
            <Button 
              variant="link" 
              onClick={() => append({ name: '', selector: '', attribute: 'text', multiple: false, required: true })}
            >
              Add your first selector
            </Button>
          </div>
        )}

        {fields.map((field, index) => (
          <Card key={field.id} className="group relative transition-all hover:shadow-md">
            <CardContent className="p-4 pt-6">
              <div className="grid grid-cols-12 gap-4 items-start">
                {/* Drag Handle (Visual only for now) */}
                <div className="col-span-1 flex items-center justify-center pt-8 text-muted-foreground/50">
                  <GripVertical className="h-5 w-5" />
                </div>

                <div className="col-span-3">
                  <FormField
                    control={control}
                    name={`selectors.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Field Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. title" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-4">
                  <FormField
                    control={control}
                    name={`selectors.${index}.selector`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">CSS Selector</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. h1.product-title" className="font-mono text-sm" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-2">
                  <FormField
                    control={control}
                    name={`selectors.${index}.attribute`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Attribute</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="text">Text Content</SelectItem>
                            <SelectItem value="src">Image Source (src)</SelectItem>
                            <SelectItem value="href">Link (href)</SelectItem>
                            <SelectItem value="value">Input Value</SelectItem>
                            <SelectItem value="innerHTML">HTML</SelectItem>
                            <SelectItem value="alt">Alt Text</SelectItem>
                            <SelectItem value="title">Title</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-2 flex flex-col justify-center gap-3 pt-6 pl-2">
                   <FormField
                    control={control}
                    name={`selectors.${index}.multiple`}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-1 shadow-sm">
                        <div className="space-y-0.5 px-2">
                          <FormLabel className="text-[10px] font-mono uppercase text-muted-foreground">List</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="scale-75"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`selectors.${index}.required`}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-1 shadow-sm">
                        <div className="space-y-0.5 px-2">
                          <FormLabel className="text-[10px] font-mono uppercase text-muted-foreground">Req</FormLabel>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="scale-75"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="col-span-1 pt-6 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
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
