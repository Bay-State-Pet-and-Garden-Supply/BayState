'use client';

import { useFormContext, useFieldArray } from 'react-hook-form';
import {
  Plus,
  Trash2,
  GripVertical,
  Navigation,
  MousePointer,
  FileText,
  Settings,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  Eye,
  Code,
  MousePointerClick,
  Keyboard,
  FilterX,
  Scroll,
  Play,
  Loader,
  Sparkles,
  Layers,
  Link,
  Unlock,
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
import { Badge } from '@/components/ui/badge';
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

// Format action type for display
function formatActionType(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Get step display name (name if set, otherwise action type)
function getStepDisplayName(action: string, name: string): string {
  if (name && name.trim()) return name;
  return formatActionType(action) || 'New Step';
}

// Get summary text for a workflow step based on its params
function getStepSummary(action: string, params: Record<string, unknown>): string {
  switch (action) {
    case 'navigate':
      return params.url ? `Navigate to: ${String(params.url).substring(0, 50)}${String(params.url).length > 50 ? '...' : ''}` : 'Navigate to URL';
    case 'click':
      return params.selector ? `Click: ${String(params.selector)}` : 'Click element';
    case 'input_text':
      const selector = params.selector ? String(params.selector) : 'element';
      const text = params.text ? String(params.text).substring(0, 20) : 'text';
      return `Type "${text}" into ${selector}`;
    case 'wait':
      return params.seconds ? `Wait ${params.seconds}s` : 'Wait';
    case 'wait_for':
      return params.selector ? `Wait for: ${String(params.selector)}` : 'Wait for selector';
    case 'extract':
      const fields = params.fields;
      if (Array.isArray(fields) && fields.length) {
        return `Extract: ${fields.join(', ')}`;
      }
      return 'Extract data';
    case 'extract_and_transform':
      const fieldCount = params.fields && Array.isArray(params.fields) ? params.fields.length : 0;
      return `Extract & transform ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
    case 'check_no_results':
      return 'Check for no results';
    case 'conditional_skip':
      return params.if_flag ? `Skip if flag: ${params.if_flag}` : 'Conditional skip';
    case 'conditional_click':
      return params.selector ? `Click if exists: ${params.selector}` : 'Conditional click';
    case 'verify':
      return params.selector ? `Verify: ${params.selector}` : 'Verify element';
    case 'scroll':
      const direction = params.direction || 'down';
      return `Scroll ${direction}`;
    case 'login':
      return 'Login flow';
    case 'transform_value':
      return params.field ? `Transform: ${params.field}` : 'Transform value';
    case 'execute_script':
      return 'Execute script';
    case 'process_images':
      return 'Process images';
    case 'combine_fields':
      return 'Combine fields';
    case 'parse_weight':
      return 'Parse weight';
    case 'extract_from_json':
      return 'Extract from JSON';
    case 'conditional':
      return 'Conditional logic';
    default:
      return formatActionType(action);
  }
}

export function WorkflowTab() {
  const form = useFormContext<ConfigFormValues>();
  const { control, watch } = form;
  const workflows = watch('workflows');

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'workflows',
  });

  const addWorkflowStep = (defaultAction: string = '') => {
    append({
      action: defaultAction,
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
        <Button onClick={() => addWorkflowStep()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Step
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No workflow steps defined yet.</p>
            <Button variant="outline" onClick={() => addWorkflowStep('navigate')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Step
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => {
            const currentAction = workflows[index]?.action || '';
            const stepName = workflows[index]?.name || '';
            const stepParams = workflows[index]?.params || {};
            const category = getActionCategory(currentAction);
            const categoryInfo = ACTION_CATEGORIES[category as keyof typeof ACTION_CATEGORIES];
            const Icon = categoryInfo?.icon || Settings;
            const displayName = getStepDisplayName(currentAction, stepName);
            const summary = getStepSummary(currentAction, stepParams);

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
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm">
                            {index + 1}. {displayName}
                          </CardTitle>
                          {currentAction && (
                            <Badge variant="outline" className="text-xs">
                              {formatActionType(currentAction)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {index > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index - 1)}
                          title="Move up"
                        >
                          ↑
                        </Button>
                      )}
                      {index < fields.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => move(index, index + 1)}
                          title="Move down"
                        >
                          ↓
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive"
                        title="Remove step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* Step summary */}
                  {summary && (
                    <p className="text-xs text-muted-foreground mt-1 ml-10">
                      {summary}
                    </p>
                  )}
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
                                  value={(field.value as string) || ''}
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
                                        {formatActionType(action)}
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
                                placeholder="e.g., Navigate to products page"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Dynamic URL/Selector field based on action type */}
                    {['navigate', 'click', 'input_text', 'wait_for', 'verify', 'conditional_click'].includes(currentAction) && (
                      <div className="sm:col-span-4">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.${currentAction === 'navigate' ? 'url' : 'selector'}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{currentAction === 'navigate' ? 'URL' : 'Selector'}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={currentAction === 'navigate' ? 'https://example.com/...' : '.class or #id'}
                                  {...field}
                                  value={field.value as string || ''}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>

                  {/* === NAVIGATE PARAMS === */}
                  {currentAction === 'navigate' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.wait_after`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Wait After (seconds)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.5}
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
                          name={`workflows.${index}.params.fail_on_error`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>Fail on Error</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value as boolean}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* === CLICK PARAMS === */}
                  {currentAction === 'click' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-4">
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
                          name={`workflows.${index}.params.filter_text_exclude`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Exclude Text</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Exclude..."
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
                          name={`workflows.${index}.params.wait_after`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Wait After (s)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  placeholder="1"
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

                  {/* === INPUT_TEXT PARAMS === */}
                  {currentAction === 'input_text' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <FormField
                            control={control}
                            name={`workflows.${index}.params.text`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Text to Type</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Text to enter..."
                                    {...field}
                                    value={field.value as string || ''}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.clear_first`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>Clear First</FormLabel>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value as boolean}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* === WAIT PARAMS === */}
                  {currentAction === 'wait' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
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

                  {/* === WAIT_FOR PARAMS === */}
                  {currentAction === 'wait_for' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.selector`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Selector(s)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder=".class or #id (comma-separated)"
                                  {...field}
                                  value={Array.isArray(field.value) ? (field.value as string[]).join(', ') : (field.value as string || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const arr = val.split(',').map(s => s.trim()).filter(Boolean);
                                    field.onChange(arr.length > 1 ? arr : val);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.timeout`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Timeout (seconds)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="10"
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

                  {/* === EXTRACT AND TRANSFORM PARAMS === */}
                  {currentAction === 'extract_and_transform' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Fields to Extract</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentFields = (workflows[index]?.params?.fields as Array<Record<string, unknown>>) || [];
                            const updatedFields = [...currentFields, { name: '', selector: '', attribute: 'text' }];
                            form.setValue(`workflows.${index}.params.fields` as any, updatedFields);
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Field
                        </Button>
                      </div>

                      {/* Fields array - use useFieldArray pattern */}
                      <ExtractFieldsArray workflowIndex={index} />
                    </div>
                  )}

                  {/* Legacy extract action - now redirects to extract_and_transform */}
                  {currentAction === 'extract' && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800 mb-2">
                          <strong>Note:</strong> The "extract" action is deprecated. 
                          Please use "extract_and_transform" instead.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            form.setValue(`workflows.${index}.action`, 'extract_and_transform');
                            // Copy fields to new format
                            const oldFields = workflows[index]?.params?.fields as string[] | undefined;
                            const oldSelectorIds = workflows[index]?.params?.selector_ids as string[] | undefined;
                            const fieldNames = [...(oldFields || []), ...(oldSelectorIds || [])];
                            if (fieldNames.length > 0) {
                              const newFields = fieldNames.map(name => ({
                                name,
                                selector: '',
                                attribute: 'text' as const,
                              }));
                              form.setValue(`workflows.${index}.params.fields` as any, newFields);
                            }
                          }}
                        >
                          Convert to extract_and_transform
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* === CHECK_NO_RESULTS PARAMS === */}
                  {currentAction === 'check_no_results' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.no_results_selectors`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>No Results Selectors (comma-separated)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder=".no-results, .empty-state"
                                  {...field}
                                  value={Array.isArray(field.value) ? field.value.join(', ') : (field.value as string || '')}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const selectors = value.split(',').map((s) => s.trim()).filter(Boolean);
                                    field.onChange(selectors);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.no_results_text_patterns`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>No Results Text Patterns (comma-separated)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="no results, not found"
                                  {...field}
                                  value={Array.isArray(field.value) ? field.value.join(', ') : (field.value as string || '')}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const patterns = value.split(',').map((s) => s.trim()).filter(Boolean);
                                    field.onChange(patterns);
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

                  {/* === CONDITIONAL_SKIP PARAMS === */}
                  {currentAction === 'conditional_skip' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.params.if_flag`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Flag Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="flag_name"
                                {...field}
                                value={field.value as string || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* === CONDITIONAL_CLICK PARAMS === */}
                  {currentAction === 'conditional_click' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.selector`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Selector</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder=".class or #id"
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
                          name={`workflows.${index}.params.timeout`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Timeout (seconds)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
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
                      </div>
                    </div>
                  )}

                  {/* === VERIFY PARAMS === */}
                  {currentAction === 'verify' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.selector`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Selector</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder=".class or #id"
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
                          name={`workflows.${index}.params.expected_value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Expected Value</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Expected text/value"
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
                          name={`workflows.${index}.params.match_mode`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Match Mode</FormLabel>
                              <Select
                                  value={(field.value as string) || ''}
                                  onValueChange={field.onChange}
                                >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="exact">Exact</SelectItem>
                                  <SelectItem value="contains">Contains</SelectItem>
                                  <SelectItem value="fuzzy_number">Fuzzy Number</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* === SCROLL PARAMS === */}
                  {currentAction === 'scroll' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.direction`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Direction</FormLabel>
                              <Select
                                  value={(field.value as string) || 'down'}
                                  onValueChange={field.onChange}
                                >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select direction" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="up">Up</SelectItem>
                                  <SelectItem value="down">Down</SelectItem>
                                  <SelectItem value="top">To Top</SelectItem>
                                  <SelectItem value="bottom">To Bottom</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Amount (px)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="500"
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
                          name={`workflows.${index}.params.selector`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Target Selector (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Scroll to element"
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
                  )}

                  {/* === EXTRACT_AND_TRANSFORM PARAMS === */}
                  {currentAction === 'extract_and_transform' && (
                    <div className="mt-4 pt-4 border-t">
                      <Label className="text-sm mb-2 block">Fields Configuration</Label>
                      <FormField
                        control={control}
                        name={`workflows.${index}.params.fields`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fields (JSON Array)</FormLabel>
                            <FormControl>
                              <Textarea
                                className="font-mono text-xs min-h-[100px]"
                                placeholder={JSON.stringify([
                                  { name: "title", selector: ".product-title", transform: [{ type: "strip" }] }
                                ], null, 2)}
                                value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}
                                onChange={(e) => {
                                  try {
                                    field.onChange(JSON.parse(e.target.value));
                                  } catch (err) {
                                    // Allow invalid JSON temporarily
                                    field.onChange(e.target.value);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* === TRANSFORM_VALUE PARAMS === */}
                  {currentAction === 'transform_value' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.field`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Source Field</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="field_name"
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
                          name={`workflows.${index}.params.target_field`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Target Field</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="new_field_name"
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
                          name={`workflows.${index}.params.regex`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Regex Pattern</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Pattern to extract"
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
                  )}

                  {/* === LOGIN PARAMS === */}
                  {currentAction === 'login' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.url`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Login URL</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="https://site.com/login"
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
                          name={`workflows.${index}.params.username_field`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username Field</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="#email or .login-field"
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
                          name={`workflows.${index}.params.password_field`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password Field</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="#password"
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
                          name={`workflows.${index}.params.submit_button`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Submit Button</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder=".btn-login or #submit"
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
                          name={`workflows.${index}.params.success_indicator`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Success Indicator (optional)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder=".user-logged-in"
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
                  )}

                  {/* === EXECUTE_SCRIPT PARAMS === */}
                  {currentAction === 'execute_script' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <FormField
                        control={control}
                        name={`workflows.${index}.params.code`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>JavaScript Code</FormLabel>
                            <FormControl>
                              <Textarea
                                className="font-mono text-xs min-h-[100px]"
                                placeholder="// Your JavaScript code here"
                                {...field}
                                value={field.value as string || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* === CONDITIONAL PARAMS === */}
                  {currentAction === 'conditional' && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.condition`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Condition (JSON)</FormLabel>
                              <FormControl>
                                <Textarea
                                  className="font-mono text-xs"
                                  placeholder='{ "field": "price", "operator": ">", "value": 100 }'
                                  {...field}
                                  value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}
                                  onChange={(e) => {
                                    try {
                                      field.onChange(JSON.parse(e.target.value));
                                    } catch (err) {
                                      field.onChange(e.target.value);
                                    }
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={control}
                          name={`workflows.${index}.params.then_action`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Then Action</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Action when true"
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
                  )}

                  {/* === PROCESS_IMAGES / COMBINE_FIELDS / PARSE_WEIGHT / EXTRACT_FROM_JSON === */}
                  {['process_images', 'combine_fields', 'parse_weight', 'extract_from_json'].includes(currentAction) && (
                    <div className="mt-4 pt-4 border-t">
                      <FormField
                        control={control}
                        name={`workflows.${index}.params`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Parameters (JSON)</FormLabel>
                            <FormControl>
                              <Textarea
                                className="font-mono text-xs min-h-[80px]"
                                placeholder={`{ "action": "..." }`}
                                value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2)}
                                onChange={(e) => {
                                  try {
                                    field.onChange(JSON.parse(e.target.value));
                                  } catch (err) {
                                    field.onChange(e.target.value);
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatActionType(currentAction)} parameters - see documentation for available options.
                      </p>
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
          <p>• Use <strong>wait</strong> or <strong>wait_for</strong> actions to allow pages to fully load</p>
          <p>• Use <strong>click</strong> actions to navigate pagination or open details</p>
          <p>• Use <strong>input_text</strong> for search boxes and login forms</p>
          <p>• End with an <strong>extract</strong> or <strong>extract_and_transform</strong> action to gather the data</p>
          <p>• Use <strong>check_no_results</strong> to handle empty result pages</p>
          <p>• Use <strong>login</strong> for authenticated scraping flows</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ExtractFieldsArray - nested component for extract_and_transform fields
function ExtractFieldsArray({ workflowIndex }: { workflowIndex: number }) {
  const { control, watch, setValue } = useFormContext<ConfigFormValues>();
  const fields = watch(`workflows.${workflowIndex}.params.fields`) as Array<{
    name: string;
    selector: string;
    attribute: string;
    multiple?: boolean;
    required?: boolean;
  }> || [];

  const addField = () => {
    const updated = [...fields, { name: '', selector: '', attribute: 'text' }];
    setValue(`workflows.${workflowIndex}.params.fields` as any, updated);
  };

  const removeField = (fieldIndex: number) => {
    const updated = fields.filter((_, i) => i !== fieldIndex);
    setValue(`workflows.${workflowIndex}.params.fields` as any, updated);
  };

  const updateField = (fieldIndex: number, updates: Partial<typeof fields[0]>) => {
    const updated = [...fields];
    updated[fieldIndex] = { ...updated[fieldIndex], ...updates };
    setValue(`workflows.${workflowIndex}.params.fields` as any, updated);
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-6 border-2 border-dashed rounded-lg">
        <p className="text-sm text-muted-foreground mb-2">No fields configured</p>
        <Button type="button" variant="outline" size="sm" onClick={addField}>
          <Plus className="mr-1 h-3 w-3" />
          Add First Field
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field, fieldIndex) => (
        <div key={fieldIndex} className="p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Field {fieldIndex + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => removeField(fieldIndex)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <FormField
                control={control}
                name={`workflows.${workflowIndex}.params.fields.${fieldIndex}.name`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Field Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., title"
                        className="h-8"
                        {...f}
                        value={typeof f.value === 'string' ? f.value : ''}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="sm:col-span-5">
              <FormField
                control={control}
                name={`workflows.${workflowIndex}.params.fields.${fieldIndex}.selector`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel className="text-xs">CSS Selector</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="#product-title"
                        className="h-8 font-mono text-xs"
                        {...f}
                        value={typeof f.value === 'string' ? f.value : ''}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <FormField
                control={control}
                name={`workflows.${workflowIndex}.params.fields.${fieldIndex}.attribute`}
                render={({ field: f }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Attribute</FormLabel>
                    <Select
                      value={typeof f.value === 'string' ? f.value : 'text'}
                      onValueChange={f.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="src">Src</SelectItem>
                        <SelectItem value="href">Href</SelectItem>
                        <SelectItem value="value">Value</SelectItem>
                        <SelectItem value="innerHTML">HTML</SelectItem>
                        <SelectItem value="innerText">InnerText</SelectItem>
                        <SelectItem value="alt">Alt</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <div className="sm:col-span-1 flex items-center justify-center gap-2 pt-5">
              <FormField
                control={control}
                name={`workflows.${workflowIndex}.params.fields.${fieldIndex}.multiple`}
                render={({ field: f }) => (
                  <FormItem className="flex flex-row items-center gap-1">
                    <FormControl>
                      <Switch
                        checked={typeof f.value === 'boolean' ? f.value : false}
                        onCheckedChange={f.onChange}
                        id={`multiple-${workflowIndex}-${fieldIndex}`}
                      />
                    </FormControl>
                    <Label
                      htmlFor={`multiple-${workflowIndex}-${fieldIndex}`}
                      className="text-xs cursor-pointer"
                    >
                      Multi
                    </Label>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addField} className="w-full">
        <Plus className="mr-1 h-3 w-3" />
        Add Another Field
      </Button>
    </div>
  );
}
