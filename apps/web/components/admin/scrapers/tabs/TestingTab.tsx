
'use client';

import { useFormContext } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfigFormValues } from '../form-schema';

export function TestingTab() {
  const { control } = useFormContext<ConfigFormValues>();
  
  // Test SKUs array
  const testSkus = useFieldArray({
    control,
    name: 'test_skus' as any, // Type cast needed for simple array of strings
  });

  // Fake SKUs array
  const fakeSkus = useFieldArray({
    control,
    name: 'fake_skus' as any,
  });

  return (
    <div className="space-y-4">
      {/* Test SKUs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Test SKUs (Known Good)</CardTitle>
            <CardDescription>
              SKUs expected to exist and return valid data. Used for health checks.
            </CardDescription>
          </div>
          <Button onClick={() => testSkus.append('')} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add SKU
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {testSkus.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <FormField
                control={control}
                name={`test_skus.${index}`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="e.g. 123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => testSkus.remove(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {testSkus.fields.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No test SKUs defined.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fake SKUs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Fake SKUs (Known Bad)</CardTitle>
            <CardDescription>
              SKUs expected to return "Not Found". Used to verify no-results detection.
            </CardDescription>
          </div>
          <Button onClick={() => fakeSkus.append('')} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add SKU
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {fakeSkus.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <FormField
                control={control}
                name={`fake_skus.${index}`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input placeholder="e.g. 999999-FAKE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fakeSkus.remove(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {fakeSkus.fields.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No fake SKUs defined.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
