'use client';

import { useState, useTransition, useDeferredValue } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Eye,
  EyeOff,
  RefreshCw,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Form } from '@/components/ui/form';

import { Skeleton } from '@/components/ui/skeleton';
import { JsonPreview } from './JsonPreview';
import { ConfigFormValues, configFormSchema, defaultConfigValues } from '@/lib/admin/scraper-configs/form-schema';
import { createScraperConfig, updateDraft, validateDraft, publishConfig } from '@/lib/admin/scraper-configs/actions';

import dynamic from 'next/dynamic';

const MetadataTab = dynamic(() => import('./tabs/MetadataTab').then(mod => mod.MetadataTab), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />
});

const WorkflowTab = dynamic(() => import('./tabs/WorkflowTab').then(mod => mod.WorkflowTab), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />
});

const LoginTab = dynamic(() => import('./tabs/LoginTab').then(mod => mod.LoginTab), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />
});

const AdvancedTab = dynamic(() => import('./tabs/AdvancedTab').then(mod => mod.AdvancedTab), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />
});

interface ConfigEditorClientProps {
  configId?: string;
  initialData?: Partial<ConfigFormValues>;
  mode: 'create' | 'edit';
}

export function ConfigEditorClient({ configId, initialData, mode }: ConfigEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState('metadata');
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');

  const form = useForm({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      ...defaultConfigValues,
      ...initialData,
    },
    mode: 'onChange',
  });

  const { watch, handleSubmit, formState: { errors, isDirty } } = form;
  const formData = watch();
  const deferredFormData = useDeferredValue(formData);

  const handleSave = handleSubmit(async (data) => {
    startTransition(async () => {
      try {
        if (mode === 'create') {
          // Create new config
          const formDataToSend = new FormData();
          formDataToSend.set('slug', data.name);
          formDataToSend.set('display_name', data.display_name || '');
          formDataToSend.set('domain', '');
          formDataToSend.set('config', JSON.stringify(data));
          formDataToSend.set('change_summary', 'Initial draft');

          const result = await createScraperConfig(formDataToSend);

          if (result.success && result.data && typeof result.data === 'object' && 'id' in result.data) {
            toast.success('Config created successfully');
            router.push(`/admin/scraper-configs/${(result.data as { id: string }).id}/edit`);
          } else {
            toast.error(result.error || 'Failed to create config');
          }
        } else {
          // Update existing draft
          const formDataToSend = new FormData();
          formDataToSend.set('configId', configId || '');
          formDataToSend.set('config', JSON.stringify(data));

          const result = await updateDraft(formDataToSend);

          if (result.success) {
            toast.success('Draft saved successfully');
            router.refresh();
          } else {
            toast.error(result.error || 'Failed to save draft');
          }
        }
      } catch (error) {
        toast.error('Failed to save config');
        console.error(error);
      }
    });
  });

  const handleValidate = async () => {
    if (!configId) {
      // For new configs, validate locally
      const result = configFormSchema.safeParse(formData);
      if (result.success) {
        setValidationStatus('valid');
        toast.success('Configuration is valid');
      } else {
        setValidationStatus('invalid');
        toast.error('Configuration has validation errors');
      }
      return;
    }

    startTransition(async () => {
      const result = await validateDraft(configId);

      if (result.success) {
        setValidationStatus('valid');
        toast.success('Draft validated successfully');
      } else {
        setValidationStatus('invalid');
        toast.error(result.error || 'Validation failed');
      }
    });
  };

  const handlePublish = async () => {
    if (!configId) {
      toast.error('Cannot publish a new config without saving first');
      return;
    }

    if (validationStatus !== 'valid') {
      toast.error('Please validate the config before publishing');
      return;
    }

    startTransition(async () => {
      const formDataToSend = new FormData();
      formDataToSend.set('configId', configId);

      const result = await publishConfig(formDataToSend);

      if (result.success) {
        toast.success('Configuration published successfully');
        router.push('/admin/scraper-configs');
      } else {
        toast.error(result.error || 'Failed to publish');
      }
    });
  };

  const hasErrors = Object.keys(errors).length > 0;
  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/scraper-configs">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-3">
            <FileCode className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-semibold">
                {mode === 'create' ? 'New Scraper Config' : (formData.display_name || formData.name || 'Untitled Config')}
              </h1>
              {mode === 'edit' && formData.base_url && (
                <p className="text-xs text-gray-600">{formData.base_url}</p>
              )}
            </div>
          </div>
          {mode === 'edit' && (
            <Badge variant={validationStatus === 'valid' ? 'default' : validationStatus === 'invalid' ? 'destructive' : 'secondary'}>
              {validationStatus === 'valid' ? 'Validated' : validationStatus === 'invalid' ? 'Invalid' : 'Not Validated'}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Validation Status Indicator */}
          {hasErrors && (
            <div className="flex items-center gap-1 text-sm text-red-600 mr-2">
              <AlertCircle className="h-4 w-4" />
              <span>{errorCount} error{errorCount > 1 ? 's' : ''}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJsonPreview(!showJsonPreview)}
          >
            {showJsonPreview ? (
              <>
                <EyeOff className="mr-1 h-4 w-4" />
                Hide JSON
              </>
            ) : (
              <>
                <Eye className="mr-1 h-4 w-4" />
                Show JSON
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={isPending}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Validate
          </Button>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || (!isDirty && mode === 'edit')}
          >
            <Save className="mr-1 h-4 w-4" />
            {isPending ? 'Saving...' : 'Save Draft'}
          </Button>

          {mode === 'edit' && (
            <Button
              variant="default"
              size="sm"
              onClick={handlePublish}
              disabled={isPending || validationStatus !== 'valid'}
            >
              <Upload className="mr-1 h-4 w-4" />
              {isPending ? 'Publishing...' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Form {...form}>
        <div className="flex flex-1 overflow-y-auto">
          <div className={`flex-1 ${showJsonPreview ? 'mr-80' : ''}`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="px-6 border-b bg-muted/40 shrink-0">
                <TabsList className="h-12 bg-transparent">
                  <TabsTrigger value="metadata" className="data-[state=active]:bg-background">
                    Metadata
                  </TabsTrigger>
                  <TabsTrigger value="workflow" className="data-[state=active]:bg-background">
                    Workflow
                  </TabsTrigger>
                  <TabsTrigger value="login" className="data-[state=active]:bg-background">
                    Login
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="data-[state=active]:bg-background">
                    Advanced
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <TabsContent value="metadata" className="m-0">
                  <MetadataTab />
                </TabsContent>

                <TabsContent value="workflow" className="m-0">
                  <WorkflowTab />
                </TabsContent>

                <TabsContent value="login" className="m-0">
                  <LoginTab />
                </TabsContent>

                <TabsContent value="advanced" className="m-0">
                  <AdvancedTab />
                </TabsContent>
              </div>
            </Tabs>
          </div>

            {/* JSON Preview Panel */}
            {showJsonPreview && (
              <div className="w-80 border-l bg-gray-50 fixed right-0 top-[4.5rem] bottom-0 overflow-hidden">
                <JsonPreview data={deferredFormData} />
              </div>
            )}
        </div>
      </Form>
    </div>
  );
}
