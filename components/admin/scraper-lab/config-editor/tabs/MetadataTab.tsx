'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export function MetadataTab() {
  const { control } = useFormContext<ScraperConfig>();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Core identity for this scraper configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Internal Name (Slug)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. amazon-products" {...field} />
                </FormControl>
                <FormDescription>
                  Unique identifier used by the system. Lowercase, hyphens allowed.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Amazon Product Scraper" {...field} />
                </FormControl>
                <FormDescription>
                  Human-readable name for the admin panel.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="base_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://www.example.com" {...field} />
                </FormControl>
                <FormDescription>
                  The starting point for this scraper.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
             <FormField
              control={control}
              name="schema_version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schema Version</FormLabel>
                  <FormControl>
                    <Input {...field} disabled readOnly className="bg-muted" />
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
