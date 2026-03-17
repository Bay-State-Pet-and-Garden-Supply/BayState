
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfigFormValues } from '../form-schema';

export function SelectorsTab() {
  const { control, formState: { errors } } = useFormContext<ConfigFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'selectors',
  });

  const addSelector = () => {
    append({
      name: '',
      selector: '',
      attribute: 'text',
      multiple: false,
      required: true,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Selectors</CardTitle>
            <CardDescription>
              Define CSS or XPath selectors to extract data elements from the page.
            </CardDescription>
          </div>
          <Button onClick={addSelector} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Selector
          </Button>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              No selectors defined. Click "Add Selector" to create one.
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-4">
              {fields.map((field, index) => (
                <AccordionItem key={field.id} value={field.id} className="border rounded-lg px-4">
                  <div className="flex items-center gap-2 py-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    <AccordionTrigger className="hover:no-underline py-2 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-medium">
                          {control._formValues.selectors[index]?.name || 'New Selector'}
                        </span>
                        {control._formValues.selectors[index]?.required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                        {errors.selectors?.[index] && (
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
                        name={`selectors.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name (ID)</FormLabel>
                            <FormControl>
                              <Input placeholder="product_title" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={control}
                        name={`selectors.${index}.attribute`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Attribute to Extract</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select attribute" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="text">Text Content</SelectItem>
                                <SelectItem value="innerHTML">Inner HTML</SelectItem>
                                <SelectItem value="href">Link (href)</SelectItem>
                                <SelectItem value="src">Image Source (src)</SelectItem>
                                <SelectItem value="alt">Alt Text</SelectItem>
                                <SelectItem value="value">Input Value</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={control}
                      name={`selectors.${index}.selector`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CSS / XPath Selector</FormLabel>
                          <FormControl>
                            <Input placeholder="h1.product-title, //div[@id='price']" className="font-mono" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-6 pt-2">
                      <FormField
                        control={control}
                        name={`selectors.${index}.multiple`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Multiple Matches</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                Extract array of values instead of single item
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name={`selectors.${index}.required`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Required</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                Fail scrape if not found
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
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
