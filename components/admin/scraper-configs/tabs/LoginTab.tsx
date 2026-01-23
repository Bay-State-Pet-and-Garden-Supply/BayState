'use client';

import { useFormContext } from 'react-hook-form';
import { Lock, Globe, Key, MousePointer, Eye, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';

export function LoginTab() {
  const form = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Login Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure login credentials for sites that require authentication.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Login Credentials
          </CardTitle>
          <CardDescription>
            Enter the selectors and credentials for the login form. These will be used during the login workflow step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <FormField
                control={form.control}
                name="login.url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Login URL
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/login"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="login.username_field"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Username Field Selector
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="#email or .username-field"
                      {...field}
                      value={field.value as string || ''}
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
                  <FormLabel className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Password Field Selector
                  </FormLabel>
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
          </div>

          <FormField
            control={form.control}
            name="login.submit_button"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MousePointer className="h-4 w-4" />
                  Submit Button Selector
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder=".btn-login or #submit-button"
                    {...field}
                    value={field.value as string || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="border-t pt-6">
            <h3 className="text-sm font-medium mb-4">Success & Failure Indicators</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="login.success_indicator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Success Indicator (optional)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder=".user-dashboard, .logged-in"
                        {...field}
                        value={field.value as string || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="login.failure_indicators"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      Failure Indicators (optional)
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder=".error-message, .login-failed"
                        className="min-h-[80px]"
                        {...field}
                        value={
                          typeof field.value === 'object' && field.value !== null
                            ? Object.entries(field.value as Record<string, unknown>)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join('\n')
                            : (field.value as string | undefined) || ''
                        }
                        onChange={(e) => {
                          const lines = e.target.value.split('\n').filter(Boolean);
                          const obj: Record<string, unknown> = {};
                          lines.forEach((line) => {
                            const [key, ...rest] = line.split(':');
                            if (key && rest.length) {
                              obj[key.trim()] = rest.join(':').trim();
                            }
                          });
                          field.onChange(obj);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login Workflow Integration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Use the <strong>login</strong> action type in your workflow to perform authentication</p>
          <p>• The login action will navigate to the login URL and attempt to authenticate</p>
          <p>• Use the success indicator to verify successful login</p>
          <p>• Failure indicators will be checked to detect login errors</p>
          <p>• After successful login, continue with your scraping workflow steps</p>
        </CardContent>
      </Card>
    </div>
  );
}
