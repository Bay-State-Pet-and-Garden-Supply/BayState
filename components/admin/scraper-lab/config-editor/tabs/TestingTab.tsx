'use client';

import React, { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Database, FileCode, PlayCircle } from 'lucide-react';
import { TestSkuManager } from '@/components/admin/scraper-studio/TestSkuManager';
import { stringify } from 'yaml';

interface TestingTabProps {
  configId?: string;
}

export function TestingTab({ configId }: TestingTabProps) {
  const { watch } = useFormContext<ScraperConfig>();
  const [activeTab, setActiveTab] = useState('database');

  const config = watch();
  const configYaml = React.useMemo(() => {
    try {
      return stringify(config, { indent: 2, lineWidth: 0 });
    } catch {
      return '';
    }
  }, [config]);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="database" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Test SKU Database
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Config YAML
          </TabsTrigger>
          <TabsTrigger value="runner" className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Test Runner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-4">
          {configId ? (
            <TestSkuManager configId={configId} configYaml={configYaml} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Database className="h-8 w-8 mb-2" />
                <p className="text-sm">Save the config to enable test SKU management</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Config-Based Test SKUs</CardTitle>
              <CardDescription>
                SKUs defined directly in the configuration YAML file.
                These are legacy and can be imported into the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={undefined as never}
                name="test_skus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Golden SKUs (Known Good)</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="SKU1, SKU2, SKU3"
                        value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                        onChange={(e) => {
                          const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={undefined as never}
                name="fake_skus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fake SKUs (Expect 404)</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="INVALID1, INVALID2"
                        value={Array.isArray(field.value) ? field.value.join(', ') : ''}
                        onChange={(e) => {
                          const val = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Runner</CardTitle>
              <CardDescription>
                Execute test runs against the configured SKUs.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <PlayCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">Test runner integration coming in Task 7</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
