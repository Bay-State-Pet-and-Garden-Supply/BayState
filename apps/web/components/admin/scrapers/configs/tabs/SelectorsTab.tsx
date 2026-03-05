'use client';

import { useFormContext, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const ATTRIBUTE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'src', label: 'Source (src)' },
  { value: 'href', label: 'Href' },
  { value: 'value', label: 'Value' },
  { value: 'innerHTML', label: 'Inner HTML' },
  { value: 'innerText', label: 'Inner Text' },
  { value: 'alt', label: 'Alt Text' },
  { value: 'title', label: 'Title' },
] as const;

export function SelectorsTab() {
  const form = useFormContext<ConfigFormValues>();
  const { control, watch } = form;
  const selectors = watch('selectors');

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'selectors',
  });

  const addSelector = () => {
    append({
      id: '',
      name: '',
      selector: '',
      attribute: 'text',
      multiple: false,
      required: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data Selectors</h2>
          <p className="text-sm text-muted-foreground">
            Define what data to extract from the page using CSS selectors.
          </p>
        </div>
        <Button onClick={addSelector}>
          <Plus className="mr-2 h-4 w-4" />
          Add Selector
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No selectors defined yet.</p>
            <Button variant="outline" onClick={addSelector}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Selector
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <CardTitle className="text-sm">Selector {index + 1}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(index, index - 1)}
                      >
                        <span className="sr-only">Move up</span>
                        ↑
                      </Button>
                    )}
                    {index < fields.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(index, index + 1)}
                      >
                        <span className="sr-only">Move down</span>
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
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <FormField
                      control={control}
                      name={`selectors.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., product_title"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <FormField
                      control={control}
                      name={`selectors.${index}.selector`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CSS Selector *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="#product-title"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <FormField
                      control={control}
                      name={`selectors.${index}.attribute`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Attribute</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ATTRIBUTE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="sm:col-span-1 flex flex-col items-center justify-center gap-2 pt-6">
                    <div className="flex items-center gap-2">
                      <FormField
                        control={control}
                        name={`selectors.${index}.multiple`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                id={`multiple-${index}`}
                              />
                            </FormControl>
                            <Label
                              htmlFor={`multiple-${index}`}
                              className="text-xs cursor-pointer"
                            >
                              Multi
                            </Label>
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <FormField
                        control={control}
                        name={`selectors.${index}.required`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                id={`required-${index}`}
                              />
                            </FormControl>
                            <Label
                              htmlFor={`required-${index}`}
                              className="text-xs cursor-pointer"
                            >
                              Req
                            </Label>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Selector Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Use CSS selectors (e.g., <code>#id</code>, <code>.class</code>, <code>element[attr=value]</code>)</p>
          <p>• Use <code>data-*</code> attributes for more reliable selectors</p>
          <p>• Enable &quot;Multiple&quot; for selectors that match multiple elements</p>
          <p>• Mark as &quot;Required&quot; if the data must be present for extraction to succeed</p>
        </CardContent>
      </Card>
    </div>
  );
}
