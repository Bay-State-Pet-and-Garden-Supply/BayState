'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Key, Server, Save, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { getFeedType } from '@/lib/b2b/credential-schema';

interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select';
  required: boolean;
  options?: string[];
  defaultValue?: number | string;
}

interface CredentialFormProps {
  distributorCode: string;
  distributorName: string;
  initialCredentials?: Record<string, string>;
  onSave?: (credentials: Record<string, string>) => Promise<void>;
}

export function CredentialForm({
  distributorCode,
  distributorName,
  initialCredentials = {},
  onSave,
}: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failure' | null>(null);

  const feedType = getFeedType(distributorCode);

  // Dynamic schema and fields based on feed type
  const getFields = (): CredentialField[] => {
    switch (feedType) {
      case 'REST':
        return [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
          { name: 'baseUrl', label: 'Base URL', type: 'text', required: false },
          { name: 'environment', label: 'Environment', type: 'select', required: false, options: ['production', 'sandbox'] },
        ];
      case 'SFTP':
        return [
          { name: 'sftpHost', label: 'SFTP Host', type: 'text', required: true },
          { name: 'sftpPort', label: 'Port', type: 'number', required: false, defaultValue: distributorCode === 'ORGILL' ? 9401 : 22 },
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true },
          { name: 'remotePath', label: 'Remote Path', type: 'text', required: false },
        ];
      case 'EDI':
        return [
          { name: 'van', label: 'VAN ID', type: 'text', required: true },
          { name: 'format', label: 'Format', type: 'text', required: false },
        ];
      default:
        return [];
    }
  };

  const fields = getFields();

  // Create dynamic schema
  const createSchema = () => {
    const shape: Record<string, any> = {};
    fields.forEach(field => {
      if (field.type === 'number') {
        shape[field.name] = field.required 
          ? z.number().int().positive() 
          : z.number().int().positive().optional();
      } else if (field.type === 'select') {
        shape[field.name] = field.required 
          ? z.enum(field.options as [string, ...string[]])
          : z.enum(field.options as [string, ...string[]]).optional();
      } else {
        shape[field.name] = field.required 
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
      }
    });
    return z.object(shape);
  };

  const schema = createSchema();
  type FormValues = z.infer<typeof schema>;

  // Get default values
  const getDefaults = (): FormValues => {
    const defaults: Record<string, any> = {};
    fields.forEach(field => {
      const key = field.name;
      if (initialCredentials[key]) {
        if (field.type === 'number') {
          defaults[key] = parseInt(initialCredentials[key], 10);
        } else {
          defaults[key] = initialCredentials[key];
        }
      } else if (field.defaultValue !== undefined) {
        defaults[key] = field.defaultValue;
      } else if (field.type === 'select') {
        defaults[key] = field.options?.[0] || '';
      }
    });
    return defaults as FormValues;
  };

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: getDefaults(),
    mode: 'onChange',
  });

  const { handleSubmit, formState: { isDirty }, reset } = form;

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/b2b/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorCode, action: 'test' }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult('success');
        toast.success('Connection test passed!');
      } else {
        setTestResult('failure');
        toast.error(data.error || 'Connection test failed');
      }
    } catch {
      setTestResult('failure');
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    startTransition(async () => {
      try {
        const credentials: Record<string, string> = {};
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            credentials[key] = String(value);
          }
        });

        const res = await fetch('/api/admin/b2b/credentials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorCode, credentials }),
        });

        const result = await res.json();

        if (result.success) {
          toast.success('Credentials saved successfully');
          if (onSave) {
            await onSave(credentials);
          }
        } else {
          toast.error(result.error || 'Failed to save credentials');
        }
      } catch (error) {
        console.error('Failed to save credentials:', error);
        toast.error('Failed to save credentials');
      }
    });
  };

  const renderField = (field: typeof fields[0]) => (
    <FormField
      key={field.name}
      control={form.control}
      name={field.name as any}
      render={({ field: fieldProps }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-2">
            {(field.type === 'password' || field.name.includes('password')) && <Key className="h-4 w-4" />}
            {(field.type === 'text' || field.type === 'number') && field.name.includes('Host') && <Server className="h-4 w-4" />}
            {field.label}
            {field.required && <span className="text-red-500">*</span>}
          </FormLabel>
          
          {field.type === 'password' ? (
            <div className="relative">
              <FormControl>
                <Input
                  type={showPasswords[field.name] ? 'text' : 'password'}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  value={fieldProps.value as string | number | readonly string[] | undefined}
                  onChange={fieldProps.onChange}
                  onBlur={fieldProps.onBlur}
                  name={fieldProps.name}
                  ref={fieldProps.ref}
                />
              </FormControl>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => togglePasswordVisibility(field.name)}
              >
                {showPasswords[field.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          ) : field.type === 'select' ? (
            <FormControl>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...fieldProps}
                value={fieldProps.value as string}
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </FormControl>
          ) : (
            <FormControl>
              <Input
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={`Enter ${field.label.toLowerCase()}`}
                {...fieldProps}
                value={fieldProps.value as string | number}
                onChange={(e) => {
                  if (field.type === 'number') {
                    fieldProps.onChange(parseInt(e.target.value, 10) || 0);
                  } else {
                    fieldProps.onChange(e.target.value);
                  }
                }}
              />
            </FormControl>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{distributorName} Credentials</CardTitle>
                <CardDescription>
                  Configure connection credentials for {distributorName}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {testResult === 'success' && (
                  <Badge className="bg-green-500">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
                {testResult === 'failure' && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Feed Type: {feedType}</Badge>
              <span className="text-sm text-muted-foreground">
                {feedType === 'REST' && 'REST API connection'}
                {feedType === 'SFTP' && 'SFTP file transfer'}
                {feedType === 'EDI' && 'EDI VAN connection'}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((field) => {
                if (field.name === 'sftpPort' || field.name === 'remotePath') {
                  return (
                    <div key={field.name} className={field.name === 'remotePath' ? 'md:col-span-2' : ''}>
                      {renderField(field)}
                    </div>
                  );
                }
                return renderField(field);
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing}>
                  {testing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => reset(getDefaults())} disabled={!isDirty || isPending}>
                  Reset
                </Button>
                <Button type="submit" disabled={!isDirty || isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Credentials
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
