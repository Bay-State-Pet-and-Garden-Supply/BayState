'use client';

import { useFormContext, Controller } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
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
  FormDescription,
} from '@/components/ui/form';
import { ConfigFormValues } from '@/lib/admin/scraper-configs/form-schema';
import { Globe, Search, Gauge, Sparkles, Factory } from 'lucide-react';

export function DiscoveryConfigPanel() {
  const form = useFormContext<ConfigFormValues>();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          AI Discovery Scraper Configuration
        </CardTitle>
        <CardDescription>
          Configure AI-powered discovery that searches for and extracts product data from manufacturer websites.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Search Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Configuration
          </h4>
          
          <FormField
            control={form.control}
            name="discovery_config.max_search_results"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Search Results</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[field.value || 5]}
                      onValueChange={(value) => field.onChange(value[0])}
                      min={1}
                      max={10}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-right">{field.value || 5}</span>
                  </div>
                </FormControl>
                <FormDescription>
                  Number of search results to analyze (1-10)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Extraction Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Extraction Settings
          </h4>
          
          <FormField
            control={form.control}
            name="discovery_config.max_steps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Steps</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[field.value || 15]}
                      onValueChange={(value) => field.onChange(value[0])}
                      min={1}
                      max={50}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-right">{field.value || 15}</span>
                  </div>
                </FormControl>
                <FormDescription>
                  Maximum browser actions per extraction (1-50)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="discovery_config.confidence_threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confidence Threshold</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[field.value || 0.7]}
                      onValueChange={(value) => field.onChange(value[0])}
                      min={0}
                      max={1}
                      step={0.1}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm text-right">{field.value || 0.7}</span>
                  </div>
                </FormControl>
                <FormDescription>
                  Minimum confidence score to accept results (0-1)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* LLM Model */}
        <FormField
          control={form.control}
          name="discovery_config.llm_model"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                LLM Model
              </FormLabel>
              <Select onValueChange={field.onChange} value={field.value || 'gpt-4o-mini'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, Cheaper)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o (More Capable)</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Model to use for AI extraction
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advanced Options */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Advanced Options
          </h4>
          
          <FormField
            control={form.control}
            name="discovery_config.prefer_manufacturer"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value !== false}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Prefer Manufacturer Websites</FormLabel>
                  <FormDescription>
                    Prioritize official brand/manufacturer sites over retailers
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="discovery_config.fallback_to_static"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value !== false}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Fallback to Static Scrapers</FormLabel>
                  <FormDescription>
                    Fall back to traditional scrapers if AI discovery fails
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
