'use client';

import React from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { Trash2, Plus } from 'lucide-react';

export function TestingTab() {
  const { control, register } = useFormContext<ScraperConfig>();
  
  // Handling array of strings for test_skus is tricky with useFieldArray directly if it's just strings
  // Typically useFieldArray expects object array. For simple string arrays, we might need a wrapper or manual handling.
  // BUT... existing schema defines test_skus as array of strings.
  // React Hook Form useFieldArray works best with objects { value: "string" }.
  // For simplicity here, we'll assume we can use a textarea for comma-separated values or just map inputs.
  
  // Let's use a simple approach: Textarea for comma-separated SKUs
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Data</CardTitle>
          <CardDescription>
            SKUs used for verification and health checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
           <FormField
            control={control}
            name="test_skus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Golden SKUs (Known Good)</FormLabel>
                <FormControl>
                   {/* Convert array to comma-string for editing */}
                   <textarea 
                     className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            control={control}
            name="fake_skus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fake SKUs (Expect 404)</FormLabel>
                <FormControl>
                   <textarea 
                     className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
