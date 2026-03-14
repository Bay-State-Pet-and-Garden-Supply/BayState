'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Save, Settings2, ShieldCheck, BoxSelect, KeyRound, Bot } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

// Basic JSON validation helper
const jsonStringSchema = z.string().refine((val) => {
  if (!val || val.trim() === '') return true;
  try {
    JSON.parse(val);
    return true;
  } catch (e) {
    console.error('Invalid JSON:', e);
    return false;
  }
}, { message: "Must be valid JSON or empty" });

const settingsSchema = z.object({
  timeout: z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => !isNaN(n) && n >= 1000 && n <= 300000, { message: "Must be a number between 1000 and 300000" }),
  retries: z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => !isNaN(n) && n >= 0 && n <= 10, { message: "Must be a number between 0 and 10" }),
  image_quality: z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => !isNaN(n) && n >= 0 && n <= 100, { message: "Must be a number between 0 and 100" }),
  anti_detection: jsonStringSchema.optional(),
  validation_config: jsonStringSchema.optional(),
  login_config: jsonStringSchema.optional(),
  ai_config: jsonStringSchema.optional(),
});
type SettingsValues = z.infer<typeof settingsSchema>;

interface SettingsFormProps {
  version: Record<string, unknown>;
  scraperType: string;
  isReadOnly?: boolean;
}

export function SettingsForm({ version, scraperType, isReadOnly = false }: SettingsFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  
  // Format initial values
  const defaultValues: SettingsValues = {
    timeout: (version.timeout as number) || 30000,
    retries: (version.retries as number) ?? 3,
    image_quality: (version.image_quality as number) ?? 80,
    anti_detection: version.anti_detection ? JSON.stringify(version.anti_detection, null, 2) : '',
    validation_config: version.validation_config ? JSON.stringify(version.validation_config, null, 2) : '',
    login_config: version.login_config ? JSON.stringify(version.login_config, null, 2) : '',
    ai_config: version.ai_config ? JSON.stringify(version.ai_config, null, 2) : '',
  };

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema) as Resolver<SettingsValues>,
    defaultValues,
  });
  const onSubmit = async (data: SettingsValues) => {
    setIsSaving(true);
    try {
      const supabase = createClient();
      
      // Parse JSON strings back to objects
      const parsedData = {
        timeout: data.timeout,
        retries: data.retries,
        image_quality: data.image_quality,
        anti_detection: data.anti_detection ? JSON.parse(data.anti_detection) : null,
        validation_config: data.validation_config ? JSON.parse(data.validation_config) : null,
        login_config: data.login_config ? JSON.parse(data.login_config) : null,
        ai_config: data.ai_config ? JSON.parse(data.ai_config) : null,
      };
      
      const { error } = await supabase
        .from('scraper_config_versions')
        .update(parsedData)
        .eq('id', version.id);
        
      if (error) throw error;
      
      router.refresh();
      // Only show success toast in real app
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Settings
        </CardTitle>
        <CardDescription>
          Configure runtime behavior and advanced options
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="p-0">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                <TabsTrigger 
                  value="general" 
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none"
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  General
                </TabsTrigger>
                <TabsTrigger 
                  value="anti-detect"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Anti-Detect
                </TabsTrigger>
                <TabsTrigger 
                  value="validation"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none"
                >
                  <BoxSelect className="mr-2 h-4 w-4" />
                  Validation
                </TabsTrigger>
                <TabsTrigger 
                  value="login"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Auth
                </TabsTrigger>
                {scraperType === 'agentic' && (
                  <TabsTrigger 
                    value="ai"
                    className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none"
                  >
                    <Bot className="mr-2 h-4 w-4" />
                    AI Prompts
                  </TabsTrigger>
                )}
              </TabsList>
              
              <div className="p-4 space-y-4 min-h-[300px]">
                {/* General Settings */}
                <TabsContent value="general" className="space-y-4 m-0">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="timeout"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timeout (ms)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} disabled={isReadOnly} />
                          </FormControl>
                          <FormDescription>Page load timeout</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="retries"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Retries</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} disabled={isReadOnly} />
                          </FormControl>
                          <FormDescription>On failure</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="image_quality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image Quality (0-100)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} disabled={isReadOnly} />
                        </FormControl>
                        <FormDescription>Quality for screenshots and product images</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* Anti-Detection Settings */}
                <TabsContent value="anti-detect" className="space-y-4 m-0">
                  <FormField
                    control={form.control}
                    name="anti_detection"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anti-Detection Rules (JSON)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            disabled={isReadOnly}
                            className="font-mono text-sm min-h-[200px]" 
                            placeholder='{
  "proxy_type": "residential",
  "browser_fingerprint": true,
  "human_interaction": "realistic"
}' 
                          />
                        </FormControl>
                        <FormDescription>Bypass rules for WAFs and bot protection</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Validation Settings */}
                <TabsContent value="validation" className="space-y-4 m-0">
                  <FormField
                    control={form.control}
                    name="validation_config"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Validation Rules (JSON)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            disabled={isReadOnly}
                            className="font-mono text-sm min-h-[200px]" 
                            placeholder='{
  "require_all_fields": false,
  "min_products": 10,
  "max_errors_percent": 5
}' 
                          />
                        </FormControl>
                        <FormDescription>Rules to pass before accepting scraped data</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Login Settings */}
                <TabsContent value="login" className="space-y-4 m-0">
                  <FormField
                    control={form.control}
                    name="login_config"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authentication Flow (JSON)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            disabled={isReadOnly}
                            className="font-mono text-sm min-h-[200px]" 
                            placeholder='{
  "type": "form",
  "url": "https://example.com/login",
  "user_selector": "#username",
  "pass_selector": "#password",
  "submit_selector": "button[type=submit]"
}' 
                          />
                        </FormControl>
                        <FormDescription>Required if site is gated. Credentials should be securely injected via environment variables at runtime.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                {/* AI Configuration */}
                {scraperType === 'agentic' && (
                  <TabsContent value="ai" className="space-y-4 m-0">
                    <FormField
                      control={form.control}
                      name="ai_config"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>AI Extraction Prompts (JSON)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              disabled={isReadOnly}
                              className="font-mono text-sm min-h-[200px]" 
                              placeholder='{
  "system_prompt": "You are a specialized e-commerce data extraction assistant...",
  "model": "gpt-4-turbo",
  "temperature": 0.1
}' 
                            />
                          </FormControl>
                          <FormDescription>Model settings and prompts for agentic scraping</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </CardContent>
          
          {form.formState.isDirty && !isReadOnly && (
            <CardFooter className="flex justify-between border-t bg-muted/20 pt-4 pb-4">
              <p className="text-sm text-muted-foreground">You have unsaved settings</p>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => form.reset()} 
                  disabled={isSaving}
                >
                  Reset
                </Button>
                <Button type="submit" size="sm" disabled={isSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </CardFooter>
          )}
        </form>
      </Form>
    </Card>
  );
}
