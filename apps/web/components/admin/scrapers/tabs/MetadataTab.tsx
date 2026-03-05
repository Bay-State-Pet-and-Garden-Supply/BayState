
'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfigFormValues } from '../form-schema';

export function MetadataTab() {
  const { control } = useFormContext<ConfigFormValues>();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Core identity settings for this scraper configuration.
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
                  Unique identifier used in code and logs. Lowercase, hyphens only.
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
                  <Input placeholder="e.g. Amazon Product Scraper" {...field} value={field.value || ''} />
                </FormControl>
                <FormDescription>
                  Human-readable name shown in the admin dashboard.
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
                  The root domain this scraper targets. Used for validation and rate limiting scope.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="schema_version"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Schema Version</FormLabel>
                <FormControl>
                  <Input {...field} disabled readOnly className="bg-muted text-muted-foreground" />
                </FormControl>
                <FormDescription>
                  Configuration schema version (managed automatically).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
