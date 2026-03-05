'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';

export function AdvancedTab() {
  const form = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Advanced Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure anti-detection, HTTP status handling, validation, and other advanced options.
        </p>
      </div>

      {/* Anti-Detection */}
      <Card>
        <CardHeader>
          <CardTitle>Anti-Detection</CardTitle>
          <CardDescription>
            Configure settings to avoid being blocked by the target website.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="anti_detection.enable_captcha_detection"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Captcha Detection</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Detect and handle captcha challenges
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.enable_rate_limiting"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Rate Limiting</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Respect rate limits with delays
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.enable_human_simulation"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Human Simulation</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Simulate human-like behavior
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.enable_session_rotation"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Session Rotation</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Rotate sessions periodically
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.enable_blocking_handling"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Blocking Handling</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Handle IP blocks and challenges
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="anti_detection.rate_limit_min_delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Min Delay (seconds)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.rate_limit_max_delay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Delay (seconds)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.session_rotation_interval"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session Rotation Interval</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anti_detection.max_retries_on_detection"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Retries on Detection</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(Number(e.target.value) || undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* HTTP Status */}
      <Card>
        <CardHeader>
          <CardTitle>HTTP Status Handling</CardTitle>
          <CardDescription>
            Configure how to handle different HTTP status codes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="http_status.enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Enable HTTP Status Handling</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Process HTTP status codes and take action
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="http_status.fail_on_error_status"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Fail on Error Status</FormLabel>
                  <p className="text-sm text-muted-foreground">
                    Stop scraping on error status codes (4xx, 5xx)
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="http_status.error_status_codes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Error Status Codes</FormLabel>
                <FormControl>
                  <Input
                    placeholder="400, 401, 403, 404, 500, 502, 503, 504"
                    value={field.value?.join(', ') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const codes = value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
                      field.onChange(codes);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="http_status.warning_status_codes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Warning Status Codes</FormLabel>
                <FormControl>
                  <Input
                    placeholder="301, 302, 307, 308"
                    value={field.value?.join(', ') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const codes = value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
                      field.onChange(codes);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Validation */}
      <Card>
        <CardHeader>
          <CardTitle>Validation</CardTitle>
          <CardDescription>
            Configure validation rules to detect empty or invalid results.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="validation.no_results_selectors"
            render={({ field }) => (
              <FormItem>
                <FormLabel>No Results Selectors</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter selectors, one per line"
                    className="min-h-[100px]"
                    value={field.value?.join('\n') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const lines = value.split('\n').map((s) => s.trim()).filter(Boolean);
                      field.onChange(lines);
                    }}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  CSS selectors that indicate no results were found.
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="validation.no_results_text_patterns"
            render={({ field }) => (
              <FormItem>
                <FormLabel>No Results Text Patterns</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter patterns, one per line"
                    className="min-h-[100px]"
                    value={field.value?.join('\n') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const lines = value.split('\n').map((s) => s.trim()).filter(Boolean);
                      field.onChange(lines);
                    }}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Text patterns that indicate no results were found.
                </p>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Login Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Login Configuration</CardTitle>
          <CardDescription>
            Optional: Configure login credentials for authenticated scraping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="login.url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Login URL</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://example.com/login"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="login.username_field"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username Field Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="email or username"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="login.password_field"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password Field Name</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="password"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="login.submit_button"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Submit Button Selector</FormLabel>
                <FormControl>
                  <Input
                    placeholder="#login-button"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="login.success_indicator"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Success Indicator Selector</FormLabel>
                <FormControl>
                  <Input
                    placeholder=".user-logged-in"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
