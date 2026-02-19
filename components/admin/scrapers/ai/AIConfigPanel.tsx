'use client';

import { useFormContext, Controller } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { Bot, Eye, Terminal, Gauge, Sparkles } from 'lucide-react';

export function AIConfigPanel() {
  const form = useFormContext<ConfigFormValues>();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Scraper Configuration
        </CardTitle>
        <CardDescription>
          Configure AI-powered browser automation settings for intelligent data extraction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Tool Selection */}
        <FormField
          control={form.control}
          name="ai_config.tool"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>AI Tool</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid gap-4"
                >
                  <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="browser-use" id="browser-use" />
                    <div className="flex-1">
                      <Label htmlFor="browser-use" className="font-medium cursor-pointer">
                        Browser-Use
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        AI-powered browser automation with natural language task execution
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormDescription>
                The AI tool that will control the browser to perform scraping tasks.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Task Description */}
        <FormField
          control={form.control}
          name="ai_config.task"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Task Description *
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Navigate to the product page, extract the product name, price, description, and image URL. Look for any sale prices or special offers."
                  className="min-h-[120px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Natural language instructions for the AI agent. Be specific about what data to extract and any special handling needed.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Max Steps */}
        <FormField
          control={form.control}
          name="ai_config.max_steps"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Max Steps ({field.value})
              </FormLabel>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Slider
                    min={1}
                    max={50}
                    step={1}
                    value={[field.value || 10]}
                    onValueChange={(vals: number[]) => field.onChange(vals[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={field.value || 10}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
              </FormControl>
              <FormDescription>
                Maximum number of actions the AI agent can take before stopping. Higher values allow for more complex tasks but take longer.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Confidence Threshold */}
        <FormField
          control={form.control}
          name="ai_config.confidence_threshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Confidence Threshold ({field.value})
              </FormLabel>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[field.value || 0.7]}
                    onValueChange={(vals: number[]) => field.onChange(vals[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={field.value || 0.7}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-20"
                  />
                </div>
              </FormControl>
              <FormDescription>
                Minimum confidence level (0-1) required for the AI to consider an action successful. Higher values reduce errors but may miss valid data.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* LLM Model */}
        <FormField
          control={form.control}
          name="ai_config.llm_model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>LLM Model</FormLabel>
              <Controller
                name="ai_config.llm_model"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster, Lower Cost)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (More Capable)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FormDescription>
                The AI model to use for task execution. GPT-4o is more capable for complex tasks, while GPT-4o Mini is faster and more cost-effective.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advanced Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Advanced Settings
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="ai_config.use_vision"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Use Vision
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Enable visual analysis of page elements
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ai_config.headless"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Headless Mode
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Run browser without visible window
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
