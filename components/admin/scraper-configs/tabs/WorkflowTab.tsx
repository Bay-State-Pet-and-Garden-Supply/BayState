'use client';

import { useFormContext, useFieldArray } from 'react-hook-form';
import {
  Plus,
  Trash2,
  GripVertical,
  Navigation,
  MousePointer,
  Search,
  Clock,
  FileText,
  Settings,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';
import { actionTypes } from '@/lib/admin/scrapers/schema';

function getActionCategory(action: string): string {
  const navigation = ['navigate', 'wait', 'wait_for', 'scroll'];
  const interaction = ['click', 'conditional_click', 'input_text'];
  const extraction = ['extract', 'extract_and_transform', 'transform_value', 'extract_from_json', 'parse_weight'];
  const control = ['conditional', 'conditional_skip', 'check_no_results'];
  const other = ['login', 'verify', 'execute_script', 'process_images', 'combine_fields'];
  
  if (navigation.includes(action)) return 'Navigation';
  if (interaction.includes(action)) return 'Interaction';
  if (extraction.includes(action)) return 'Extraction';
  if (control.includes(action)) return 'Control';
  if (other.includes(action)) return 'Other';
  return 'Other';
}

const ACTION_CATEGORIES = {
  Navigation: { color: 'border-blue-200 bg-blue-50 text-blue-600', icon: Navigation },
  Interaction: { color: 'border-green-200 bg-green-50 text-green-600', icon: MousePointer },
  Extraction: { color: 'border-purple-200 bg-purple-50 text-purple-600', icon: FileText },
  Control: { color: 'border-orange-200 bg-orange-50 text-orange-600', icon: AlertTriangle },
  Other: { color: 'border-gray-200 bg-gray-50 text-gray-600', icon: Settings },
} as const;

export function WorkflowTab() {
  const form = useFormContext<ConfigFormValues>();
  const { control, watch } = form;
  const workflows = watch('workflows');

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'workflows',
  });

  const addWorkflowStep = () => {
    append({
      action: '',
      name: '',
      params: {},
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Steps</h2>
          <p className="text-sm text-muted-foreground">
            Define the sequence of actions the scraper will execute.
          </p>
        </div>
        <Button onClick={addWorkflowStep}>
          <Plus className="mr-2 h-4 w-4" />
          Add Step
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No workflow steps defined yet.</p>
            <Button variant="outline" onClick={addWorkflowStep}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Step
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => {
            const currentAction = workflows[index]?.action || '';
            const category = getActionCategory(currentAction);
            const categoryInfo = ACTION_CATEGORIES[category as keyof typeof ACTION_CATEGORIES];
            const Icon = categoryInfo?.icon || Settings;

            return (
              <Card key={field.id} className="overflow-hidden">
                <CardHeader className="pb-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md bg-background border ${categoryInfo?.color || ''}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-sm">Step {index + 1}</CardTitle>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {index > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index - 1)}
                        >
                          ↑
                        </Button>
                      )}
                      {index < fields.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index + 1)}
                        >
                          ↓
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid gap-4 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.action`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Action Type *</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select action..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {actionTypes.map((action) => {
                                  const cat = getActionCategory(action);
                                  const catInfo = ACTION_CATEGORIES[cat as keyof typeof ACTION_CATEGORIES];
                                  return (
                                    <SelectItem key={action} value={action}>
                                      <span className="flex items-center gap-2">
                                        {catInfo && <catInfo.icon className="h-3 w-3" />}
                                        {action.replace(/_/g, ' ')}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Step Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Navigate to products"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.params.url`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>URL / Selector</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://example.com/..."
                                {...field}
                                value={field.value as string || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Additional params based on action type */}
                  {currentAction === 'navigate' && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-xs mb-2 block">Wait After Navigation (seconds)</Label>
                      <FormField
                        control={control}
                        name={`workflows.${index}.params.wait_after`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                placeholder="2"
                                className="w-32"
                                {...field}
                                value={field.value as number || ''}
                                onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {currentAction === 'click' && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-xs mb-2 block">Click Options</Label>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.filter_text`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Filter Text</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Filter by text..."
                                  {...field}
                                  value={field.value as string || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.index`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Index</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  {...field}
                                  value={field.value as number || ''}
                                  onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.max_retries`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max Retries</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="3"
                                  {...field}
                                  value={field.value as number || ''}
                                  onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {currentAction === 'wait' && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-xs mb-2 block">Wait Duration</Label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.seconds`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Seconds</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  placeholder="2"
                                  {...field}
                                  value={field.value as number || ''}
                                  onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.duration`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration (ms)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="2000"
                                  {...field}
                                  value={field.value as number || ''}
                                  onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {currentAction === 'extract' && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-xs mb-2 block">Extract Options</Label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.fields`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fields (comma-separated)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="title, price, description"
                                  {...field}
                                  value={Array.isArray(field.value) ? field.value.join(', ') : (field.value as string || '')}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const fields = value.split(',').map((s) => s.trim()).filter(Boolean);
                                    field.onChange(fields);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.selector_ids`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Selector IDs (comma-separated)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="product_title, product_price"
                                  {...field}
                                  value={Array.isArray(field.value) ? field.value.join(', ') : (field.value as string || '')}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
                                    field.onChange(ids);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workflow Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Start with a <strong>navigate</strong> action to load the target page</p>
          <p>• Use <strong>wait</strong> actions to allow pages to fully load</p>
          <p>• Use <strong>click</strong> actions to navigate pagination or open details</p>
          <p>• End with an <strong>extract</strong> action to gather the data</p>
          <p>• Use <strong>check_no_results</strong> to handle empty result pages</p>
        </CardContent>
      </Card>
    </div>
  );
}
