
'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ConfigFormValues } from '../form-schema';

export function ConfigurationTab() {
  const { control } = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Runtime Configuration</CardTitle>
          <CardDescription>
            Settings that control how the scraper executes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            control={control}
            name="timeout"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Global Timeout (seconds)</FormLabel>
                <FormControl>
                  <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                </FormControl>
                <FormDescription>
                  Maximum execution time before hard stop.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="retries"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Retries</FormLabel>
                <FormControl>
                  <Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                </FormControl>
                <FormDescription>
                  Number of times to retry failed requests or actions.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="image_quality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image Quality ({field.value}%)</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <Slider
                      min={10}
                      max={100}
                      step={5}
                      value={[field.value || 50]}
                      onValueChange={(vals: number[]) => field.onChange(vals[0])}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-right">{field.value}%</span>
                  </div>
                </FormControl>
                <FormDescription>
                  Compression level for extracted images. Lower is faster but blurrier.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
