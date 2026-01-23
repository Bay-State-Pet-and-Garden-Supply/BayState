'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useForm, UseFormReturn, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';

import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { ScraperConfig } from '@/lib/admin/scrapers/types';
import { updateDraft, validateDraft, publishConfig, ActionState } from '@/lib/admin/scraper-configs/actions';

// Tabs
import { MetadataTab } from './tabs/MetadataTab';
import { SelectorsTab } from './tabs/SelectorsTab';
import { WorkflowTab } from './tabs/WorkflowTab';
import { ConfigurationTab } from './tabs/ConfigurationTab';
import { AdvancedTab } from './tabs/AdvancedTab';
import { TestingTab } from './tabs/TestingTab';
import { PreviewTab } from './tabs/PreviewTab';
import { ValidationSummary } from './validation/ValidationSummary';

interface ConfigEditorClientProps {
  configId: string;
  initialConfig: ScraperConfig;
  initialStatus: string;
  initialVersion: number;
  initialValidationResult?: any;
}

export function ConfigEditorClient({
  configId,
  initialConfig,
  initialStatus,
  initialVersion,
  initialValidationResult
}: ConfigEditorClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('metadata');
  const [status, setStatus] = useState(initialStatus);
  const [version, setVersion] = useState(initialVersion);
  const [validationResult, setValidationResult] = useState(initialValidationResult);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const form = useForm<ScraperConfig>({
    resolver: zodResolver(scraperConfigSchema),
    defaultValues: initialConfig,
    mode: 'onChange',
  });

  const { formState, handleSubmit, getValues, reset } = form;
  const { isDirty, isValid } = formState;

  // Handle Save Draft
  const onSaveDraft = async () => {
    setIsSaving(true);
    try {
      const currentConfig = getValues();
      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('config', JSON.stringify(currentConfig));
      formData.append('change_summary', `Draft update v${version}`);

      const result = await updateDraft(formData);

      if (result.success) {
        toast.success('Draft saved successfully');
        reset(currentConfig); // Reset dirty state
        setStatus('draft'); // Saving always reverts to draft
        setValidationResult(null); // Clear validation on save
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to save draft');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Validate
  const onValidate = async () => {
    // Save first if dirty
    if (isDirty) {
      await onSaveDraft();
    }

    setIsValidating(true);
    try {
      const result = await validateDraft(configId);

      if (result.success) {
        setValidationResult(result.data);
        if (result.data?.valid) {
          toast.success('Configuration is valid');
          setStatus('validated');
        } else {
          toast.error('Validation failed. Check the errors.');
          setStatus('draft');
        }
        router.refresh();
      } else {
        toast.error(result.error || 'Validation failed');
      }
    } catch (error) {
      toast.error('An error occurred during validation');
      console.error(error);
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Publish
  const onPublish = async () => {
    if (status !== 'validated') {
      toast.error('Config must be validated before publishing');
      return;
    }

    setIsPublishing(true);
    try {
      const formData = new FormData();
      formData.append('configId', configId);
      
      const result = await publishConfig(formData);

      if (result.success) {
        toast.success('Configuration published successfully');
        setStatus('published');
        setVersion((v) => v + 1);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to publish');
      }
    } catch (error) {
      toast.error('An error occurred during publishing');
      console.error(error);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <FormProvider {...form}>
      <div className="flex flex-col h-full bg-background space-y-4">
        {/* Header / Toolbar */}
        <Card className="border-none rounded-none border-b shadow-sm sticky top-0 z-10 bg-card">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold tracking-tight">Config Editor</h1>
              <div className="flex items-center gap-2">
                <Badge variant={status === 'published' ? 'default' : status === 'validated' ? 'secondary' : 'outline'}>
                  {status.toUpperCase()}
                </Badge>
                <Badge variant="outline">v{version}</Badge>
                {isDirty && <Badge variant="destructive" className="animate-pulse">Unsaved Changes</Badge>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={onSaveDraft} 
                disabled={isSaving || isPublishing}
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Draft
              </Button>
              
              <Button 
                variant="secondary" 
                onClick={onValidate}
                disabled={isValidating || isSaving || isPublishing}
              >
                {isValidating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Validate
              </Button>

              <Button 
                onClick={onPublish}
                disabled={status !== 'validated' || isPublishing || isDirty}
                className={status === 'validated' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Publish
              </Button>
            </div>
          </div>
          
          {/* Validation Errors Summary */}
          {validationResult && !validationResult.valid && (
            <div className="px-4 pb-4">
               <ValidationSummary errors={validationResult.errors} />
            </div>
          )}
        </Card>

        {/* Main Tabs */}
        <div className="flex-1 px-4 pb-8 overflow-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0 mb-6">
              <TabsTrigger value="metadata" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Metadata
              </TabsTrigger>
              <TabsTrigger value="selectors" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Selectors
              </TabsTrigger>
              <TabsTrigger value="workflow" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Workflow
              </TabsTrigger>
              <TabsTrigger value="config" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Configuration
              </TabsTrigger>
              <TabsTrigger value="advanced" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Advanced
              </TabsTrigger>
              <TabsTrigger value="testing" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                Testing
              </TabsTrigger>
              <TabsTrigger value="preview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 ml-auto">
                JSON Preview
              </TabsTrigger>
            </TabsList>

            <div className="max-w-5xl mx-auto">
              <TabsContent value="metadata">
                <MetadataTab />
              </TabsContent>
              <TabsContent value="selectors">
                <SelectorsTab />
              </TabsContent>
              <TabsContent value="workflow">
                <WorkflowTab />
              </TabsContent>
              <TabsContent value="config">
                <ConfigurationTab />
              </TabsContent>
              <TabsContent value="advanced">
                <AdvancedTab />
              </TabsContent>
              <TabsContent value="testing">
                <TestingTab />
              </TabsContent>
              <TabsContent value="preview">
                <PreviewTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </FormProvider>
  );
}
