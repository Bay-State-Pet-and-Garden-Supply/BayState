'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';

export function MetadataTab() {
  const form = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Metadata</h2>
        <p className="text-sm text-muted-foreground">
          Basic configuration metadata for this scraper.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Information</CardTitle>
          <CardDescription>
            Configure the basic identifying information for this scraper.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Scraper Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., amazon-product-scraper"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this scraper. Lowercase with hyphens.
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Amazon Product Scraper"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Human-readable name shown in the admin panel.
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="base_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL *</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  The main URL this scraper will operate on.
                </p>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="schema_version"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Schema Version *</FormLabel>
                <FormControl>
                  <Input {...field} disabled className="bg-muted" />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Configuration schema version. Read-only.
                </p>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance Settings</CardTitle>
          <CardDescription>
            Configure timeout and retry behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="timeout"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timeout (seconds)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="retries"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Retries</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="image_quality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image Quality (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test SKUs</CardTitle>
          <CardDescription>
            SKUs used for testing this scraper configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="test_skus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test SKUs</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter SKUs separated by commas"
                    value={field.value?.join(', ') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const skus = value.split(',').map((s) => s.trim()).filter(Boolean);
                      field.onChange(skus);
                    }}
                  />
                </FormControl>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of SKUs for testing this scraper.
                </p>
              </FormItem>
            )}
          />

          <div className="grid gap-4 mt-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="fake_skus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fake SKUs</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter fake SKUs separated by commas"
                      value={field.value?.join(', ') || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const skus = value.split(',').map((s) => s.trim()).filter(Boolean);
                        field.onChange(skus);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="edge_case_skus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edge Case SKUs</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter edge case SKUs separated by commas"
                      value={field.value?.join(', ') || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const skus = value.split(',').map((s) => s.trim()).filter(Boolean);
                        field.onChange(skus.length > 0 ? skus : undefined);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
