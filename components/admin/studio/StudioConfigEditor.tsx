'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, CheckCircle2, AlertTriangle, Upload, FileJson, FileCode, GitBranch } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parse, stringify } from 'yaml';

import { configFormSchema, defaultConfigValues } from '@/lib/admin/scraper-configs/form-schema';
import { updateDraft, validateDraft, publishConfig } from '@/lib/admin/scraper-configs/actions';
import { createVersion, publishVersion, rollbackToVersion, fetchVersions } from '@/lib/admin/scraper-studio/version-actions';
import type { ScraperConfig } from '@/lib/admin/scrapers/types';

import { MetadataTab } from '../scraper-lab/config-editor/tabs/MetadataTab';
import { SelectorsTab } from '../scraper-lab/config-editor/tabs/SelectorsTab';
import { WorkflowTab } from '../scraper-lab/config-editor/tabs/WorkflowTab';
import { ConfigurationTab } from '../scraper-lab/config-editor/tabs/ConfigurationTab';
import { AdvancedTab } from '../scraper-lab/config-editor/tabs/AdvancedTab';
import { TestingTab } from '../scraper-lab/config-editor/tabs/TestingTab';
import { PreviewTab } from '../scraper-lab/config-editor/tabs/PreviewTab';
import { ValidationSummary } from '../scraper-lab/config-editor/validation/ValidationSummary';
import { VersionHistory, type Version } from '../scraper-studio/VersionHistory';

interface StudioConfigEditorProps {
  configId: string;
  configName: string;
  initialConfig: ScraperConfig;
  initialStatus: string;
  initialVersion: number;
  initialValidationResult?: {
    valid: boolean;
    validated_at?: string;
    errors?: string[];
  } | null;
  onClose: () => void;
}

interface ValidationStatus {
  isValid: boolean;
  error?: string;
  line?: number;
  column?: number;
}

export function StudioConfigEditor({
  configId,
  configName,
  initialConfig,
  initialStatus,
  initialVersion,
  initialValidationResult,
  onClose,
}: StudioConfigEditorProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('metadata');
  const [editorMode, setEditorMode] = useState<'form' | 'yaml'>('form');
  const [status, setStatus] = useState(initialStatus);
  const [version, setVersion] = useState(initialVersion);
  const [validationResult, setValidationResult] = useState<StudioConfigEditorProps['initialValidationResult']>(initialValidationResult);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [yamlValidation, setYamlValidation] = useState<ValidationStatus>({ isValid: true });
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const loadVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    try {
      const result = await fetchVersions(configId);
      if (result.success && result.data) {
        setVersions(result.data as Version[]);
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [configId]);

  const form = useForm<ScraperConfig>({
    resolver: zodResolver(configFormSchema) as any,
    defaultValues: initialConfig,
    mode: 'onChange',
  });

  const { formState, handleSubmit, getValues, reset, watch } = form;
  const { isDirty, isValid } = formState;

  useEffect(() => {
    try {
      const yaml = stringify(initialConfig, { indent: 2, lineWidth: 0 });
      setYamlContent(yaml);
    } catch (error) {
      console.error('Failed to convert config to YAML:', error);
      setYamlContent('# Error converting config to YAML\n');
    }
  }, [initialConfig]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    const draftKey = `studio-config-draft-${configId}`;

    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        reset(parsed.config);
        setYamlContent(parsed.yaml);
        toast.info('Restored unsaved draft');
      } catch (error) {
        console.error('Failed to parse draft:', error);
      }
    }

    const autoSaveInterval = setInterval(() => {
      if (isDirty) {
        const currentConfig = getValues();
        const draft = {
          config: currentConfig,
          yaml: yamlContent,
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
        setLastSavedAt(new Date());
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [configId, isDirty, getValues, yamlContent, reset]);

  const validateYaml = useCallback((content: string): ValidationStatus => {
    if (!content.trim()) {
      return { isValid: false, error: 'YAML content cannot be empty' };
    }

    try {
      parse(content);
      return { isValid: true };
    } catch (error: any) {
      const match = error.message?.match(/at line (\d+), column (\d+)/);
      return {
        isValid: false,
        error: error.message || 'Invalid YAML syntax',
        line: match ? parseInt(match[1], 10) : undefined,
        column: match ? parseInt(match[2], 10) : undefined,
      };
    }
  }, []);

  const handleYamlChange = useCallback((value: string) => {
    setYamlContent(value);
    const validation = validateYaml(value);
    setYamlValidation(validation);

    if (validation.isValid) {
      try {
        const parsed = parse(value);
        reset(parsed, { keepDirty: true });
      } catch {
        // Ignore parse errors during typing
      }
    }
  }, [reset, validateYaml]);

  const onSaveDraft = async () => {
    setIsSaving(true);
    try {
      let currentConfig: ScraperConfig;

      if (editorMode === 'yaml') {
        if (!yamlValidation.isValid) {
          toast.error('Cannot save: YAML has syntax errors');
          setIsSaving(false);
          return;
        }
        currentConfig = parse(yamlContent);
      } else {
        currentConfig = getValues();
      }

      const formData = new FormData();
      formData.append('configId', configId);
      formData.append('config', JSON.stringify(currentConfig));
      formData.append('change_summary', `Draft update v${version} (Studio)`);

      const result = await updateDraft(formData);

      if (result.success) {
        toast.success('Draft saved successfully');
        reset(currentConfig);
        setStatus('draft');
        setValidationResult(null);
        
        // Clear draft from localStorage after successful save
        localStorage.removeItem(`studio-config-draft-${configId}`);
        setLastSavedAt(null);
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

  const onValidate = async () => {
    if (isDirty) {
      await onSaveDraft();
    }

    setIsValidating(true);
    try {
      const result = await validateDraft(configId);

      if (result.success) {
        const validationData = result.data as { valid: boolean; validated_at?: string; errors?: string[] } | null | undefined;
        setValidationResult(validationData ?? null);
        if (validationData?.valid) {
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

  const saveDraftToStorage = () => {
    const currentConfig = getValues();
    const draft = {
      config: currentConfig,
      yaml: yamlContent,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(`studio-config-draft-${configId}`, JSON.stringify(draft));
    setLastSavedAt(new Date());
    toast.success('Draft auto-saved locally');
  };

  const handleCreateVersion = async (config: Record<string, unknown>, comment: string) => {
    const formData = new FormData();
    formData.append('configId', configId);
    formData.append('config', JSON.stringify(config));
    formData.append('change_summary', comment);
    return await createVersion(formData);
  };

  const handlePublishVersion = async (versionId: string) => {
    const formData = new FormData();
    formData.append('versionId', versionId);
    const result = await publishVersion(formData);
    if (result.success) {
      setStatus('published');
      setVersion((v) => v + 1);
      await loadVersions();
    }
    return result;
  };

  const handleRollback = async (targetVersionId: string, reason: string) => {
    const formData = new FormData();
    formData.append('versionId', targetVersionId);
    formData.append('reason', reason);
    const result = await rollbackToVersion(formData);
    if (result.success) {
      await loadVersions();
    }
    return result;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <Card className="border-none rounded-none border-b shadow-sm bg-card">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              ← Back
            </Button>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{configName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={status === 'published' ? 'default' : status === 'validated' ? 'secondary' : 'outline'}>
                  {status.toUpperCase()}
                </Badge>
                <Badge variant="outline">v{version}</Badge>
                {isDirty && <Badge variant="destructive" className="animate-pulse">Unsaved Changes</Badge>}
                {lastSavedAt && (
                  <span className="text-xs text-muted-foreground">
                    Auto-saved {lastSavedAt.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md mr-4">
              <Button
                variant={editorMode === 'form' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setEditorMode('form')}
                className="rounded-none rounded-l-md"
              >
                <FileJson className="mr-2 h-4 w-4" />
                Form
              </Button>
              <Button
                variant={editorMode === 'yaml' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setEditorMode('yaml')}
                className="rounded-none rounded-r-md"
              >
                <FileCode className="mr-2 h-4 w-4" />
                YAML
              </Button>
            </div>

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
        
        {validationResult && !validationResult.valid && (
          <div className="px-4 pb-4">
             <ValidationSummary errors={validationResult.errors || []} />
          </div>
        )}
      </Card>

      <div className="flex-1 overflow-auto p-4">
        {editorMode === 'yaml' ? (
          <Card className="h-full">
            <CardHeader>
              <CardTitle>YAML Editor</CardTitle>
              <CardDescription>
                Edit the configuration directly in YAML format. Auto-saves every 30 seconds.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!yamlValidation.isValid && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>YAML Syntax Error</AlertTitle>
                  <AlertDescription>
                    {yamlValidation.error}
                    {yamlValidation.line && (
                      <span className="block text-sm mt-1">
                        Line {yamlValidation.line}
                        {yamlValidation.column && `, Column ${yamlValidation.column}`}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {yamlValidation.isValid && yamlContent && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Valid YAML</AlertTitle>
                  <AlertDescription>
                    Configuration syntax is valid and can be saved.
                  </AlertDescription>
                </Alert>
              )}
              <Textarea
                value={yamlContent}
                onChange={(e) => handleYamlChange(e.target.value)}
                className="font-mono text-sm min-h-[500px]"
                placeholder="# Enter YAML configuration..."
                spellCheck={false}
              />
            </CardContent>
          </Card>
        ) : (
          <FormProvider {...form}>
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
                <TabsTrigger value="versions" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6">
                  Versions
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
                  <TestingTab configId={configId} />
                </TabsContent>
                <TabsContent value="versions">
                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <VersionHistory
                      configId={configId}
                      configName={configName}
                      versions={versions}
                      currentVersionId={configId}
                      onVersionChange={loadVersions}
                      onCreateVersion={handleCreateVersion}
                      onPublishVersion={handlePublishVersion}
                      onRollback={handleRollback}
                      currentConfig={getValues()}
                    />
                  )}
                </TabsContent>
                <TabsContent value="preview">
                  <PreviewTab />
                </TabsContent>
              </div>
            </Tabs>
          </FormProvider>
        )}
      </div>
    </div>
  );
}

export default StudioConfigEditor;
