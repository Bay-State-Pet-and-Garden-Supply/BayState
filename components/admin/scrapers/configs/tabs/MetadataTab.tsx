'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';
import { AIConfigPanel } from '@/components/admin/scrapers/ai/AIConfigPanel';
import { DiscoveryConfigPanel } from '@/components/admin/scrapers/ai/DiscoveryConfigPanel';

export function MetadataTab() {
  const form = useFormContext<ConfigFormValues>();
  const scraperType = useWatch({ control: form.control, name: 'scraper_type' });

  const handleScraperTypeChange = (value: 'static' | 'ai' | 'discovery') => {
    form.setValue('scraper_type', value);

    // Initialize ai_config when switching to AI type
    if (value === 'ai' && !form.getValues('ai_config')) {
      form.setValue('ai_config', {
        tool: 'browser-use',
        task: '',
        max_steps: 10,
        confidence_threshold: 0.7,
        llm_model: 'gpt-4o-mini',
        use_vision: true,
        headless: true,
      });
    }

    if (value === 'discovery' && !form.getValues('discovery_config')) {
      form.setValue('discovery_config', {
        enabled: true,
        max_search_results: 5,
        max_steps: 15,
        confidence_threshold: 0.7,
        llm_model: 'gpt-4o-mini',
        prefer_manufacturer: true,
        fallback_to_static: true,
      });
    }
  };

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
          <CardTitle>Scraper Type</CardTitle>
          <CardDescription>
            Choose scraping approach: static selectors, AI-powered navigation, or AI discovery from manufacturer websites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="scraper_type"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => handleScraperTypeChange(value as 'static' | 'ai' | 'discovery')}
                    defaultValue={field.value}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <FormItem className="flex items-start space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="static" />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="font-medium">Traditional (Static)</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Use CSS selectors and predefined actions. Best for simple, static sites.
                        </p>
                      </div>
                    </FormItem>
                    <FormItem className="flex items-start space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="ai" />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="font-medium">AI-Powered</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Use AI to intelligently navigate and extract data. Best for JavaScript-heavy sites or complex interactions.
                        </p>
                      </div>
                    </FormItem>
                    <FormItem className="flex items-start space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="discovery" />
                      </FormControl>
                      <div className="space-y-1">
                        <FormLabel className="font-medium">AI Discovery</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Automatically search and scrape manufacturer websites. No site configuration needed.
                        </p>
                      </div>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {scraperType === 'ai' && <AIConfigPanel />}
      {scraperType === 'discovery' && <DiscoveryConfigPanel />}

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
