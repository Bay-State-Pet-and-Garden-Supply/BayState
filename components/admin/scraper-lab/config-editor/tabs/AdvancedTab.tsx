'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AdvancedTab() {
  const { control } = useFormContext<ScraperConfig>();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="anti_detection">
        <TabsList>
          <TabsTrigger value="anti_detection">Anti-Detection</TabsTrigger>
          <TabsTrigger value="http_status">HTTP Status</TabsTrigger>
          <TabsTrigger value="login">Login Config</TabsTrigger>
        </TabsList>

        <TabsContent value="anti_detection">
          <Card>
            <CardHeader>
              <CardTitle>Anti-Detection Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="anti_detection.enable_human_simulation"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Human Simulation</FormLabel>
                      <FormDescription>
                        Adds random mouse movements and typing delays.
                      </FormDescription>
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
                control={control}
                name="anti_detection.enable_session_rotation"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Session Rotation</FormLabel>
                      <FormDescription>
                        Rotates browser context and cookies.
                      </FormDescription>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="http_status">
          <Card>
            <CardHeader>
              <CardTitle>HTTP Status Handling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={control}
                name="http_status.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Status Checks</FormLabel>
                      <FormDescription>
                        Monitor HTTP status codes of navigation responses.
                      </FormDescription>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="login">
           <Card>
            <CardHeader>
               <CardTitle>Login Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <FormField
                  control={control}
                  name="login.url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Login URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/login" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
               />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={control}
                    name="login.username_field"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username Selector</FormLabel>
                        <FormControl>
                          <Input placeholder="#username" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={control}
                    name="login.password_field"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password Selector</FormLabel>
                        <FormControl>
                          <Input placeholder="#password" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
            </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
