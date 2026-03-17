
'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ConfigFormValues } from '../form-schema';
import { actionTypes } from '@/lib/admin/scrapers/schema';

export function WorkflowTab() {
  const { control, formState: { errors } } = useFormContext<ConfigFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'workflows',
  });

  const addStep = () => {
    append({
      action: 'navigate',
      name: '',
      params: {},
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Workflow Steps</CardTitle>
            <CardDescription>
              Define the sequence of actions the scraper will execute.
            </CardDescription>
          </div>
          <Button onClick={addStep} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Step
          </Button>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              No workflow steps defined. Click "Add Step" to start.
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-4">
              {fields.map((field, index) => (
                <AccordionItem key={field.id} value={field.id} className="border rounded-lg px-4">
                  <div className="flex items-center gap-2 py-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    <AccordionTrigger className="hover:no-underline py-2 flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="font-mono">
                          {index + 1}
                        </Badge>
                        <span className="font-medium">
                          {control._formValues.workflows[index]?.action || 'New Step'}
                        </span>
                        {control._formValues.workflows[index]?.name && (
                          <span className="text-muted-foreground text-sm">
                            - {control._formValues.workflows[index]?.name}
                          </span>
                        )}
                        {errors.workflows?.[index] && (
                          <Badge variant="destructive" className="text-xs flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(index);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <AccordionContent className="pb-4 pt-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.action`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Action Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select action" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-[300px]">
                                {actionTypes.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={control}
                        name={`workflows.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Step Name (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Description of this step" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={control}
                      name={`workflows.${index}.params`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Parameters (JSON)</FormLabel>
                          <FormControl>
                            <Textarea
                              className="font-mono text-xs"
                              rows={5}
                              placeholder='{ "url": "..." }'
                              value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}
                              onChange={(e) => {
                                try {
                                  field.onChange(JSON.parse(e.target.value));
                                } catch (err) {
                                  // Allow typing invalid JSON temporarily? 
                                  // Ideally we'd have a better UI for params per action type
                                  // For now, this is a raw JSON editor fallback
                                }
                              }}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Raw JSON parameters for this action.
                            {/* TODO: Build specialized sub-forms for each action type in future iteration */}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
