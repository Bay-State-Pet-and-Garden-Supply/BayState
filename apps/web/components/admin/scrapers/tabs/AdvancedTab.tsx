
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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfigFormValues } from '../form-schema';

export function AdvancedTab() {
  const { control } = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-4">
      {/* Anti-Detection Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Anti-Detection</CardTitle>
          <CardDescription>
            Strategies to avoid being blocked by target sites.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="anti_detection.enable_captcha_detection"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Captcha Detection</FormLabel>
                  <FormDescription>
                    Automatically pause and alert if captcha is detected.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="anti_detection.enable_rate_limiting"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Intelligent Rate Limiting</FormLabel>
                  <FormDescription>
                    Dynamically adjust request delays based on response times.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="anti_detection.enable_human_simulation"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Human Simulation</FormLabel>
                  <FormDescription>
                    Add random mouse movements and typing delays.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4 mt-4">
            <FormField
              control={control}
              name="anti_detection.rate_limit_min_delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Min Delay (s)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="anti_detection.rate_limit_max_delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Delay (s)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" {...field} onChange={e => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* HTTP Status Settings */}
      <Card>
        <CardHeader>
          <CardTitle>HTTP Handling</CardTitle>
          <CardDescription>
            Configure how to handle specific HTTP status codes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="http_status.enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Enable HTTP Status Checking</FormLabel>
                  <FormDescription>
                    Monitor response codes and act accordingly.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
          
          <FormField
            control={control}
            name="http_status.fail_on_error_status"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Fail on Error Status</FormLabel>
                  <FormDescription>
                    Abort job if 4xx or 5xx status encountered.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
