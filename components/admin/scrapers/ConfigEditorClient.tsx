
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  MousePointer2, 
  GitMerge, 
  Settings, 
  ShieldAlert, 
  FlaskConical, 
  Eye 
} from 'lucide-react';

import { MetadataTab } from './tabs/MetadataTab';
import { SelectorsTab } from './tabs/SelectorsTab';
import { WorkflowTab } from './tabs/WorkflowTab';
import { ConfigurationTab } from './tabs/ConfigurationTab';
import { AdvancedTab } from './tabs/AdvancedTab';
import { TestingTab } from './tabs/TestingTab';
import { PreviewTab } from './tabs/PreviewTab';
import { ValidationSummary } from './validation/ValidationSummary';
import { SaveDraftButton } from './actions/SaveDraftButton';
import { ValidateButton } from './actions/ValidateButton';
import { PublishButton } from './actions/PublishButton';

import { configFormSchema, ConfigFormValues, defaultConfigValues } from './form-schema';
import { ScraperRecord } from '@/lib/admin/scrapers/types';

interface ConfigEditorClientProps {
  scraper: ScraperRecord;
  currentVersion?: any; // ScraperConfigVersion
}

export function ConfigEditorClient({ scraper, currentVersion }: ConfigEditorClientProps) {
  // Merge default values with existing config
  const initialValues: ConfigFormValues = {
    ...defaultConfigValues,
    ...scraper.config,
    // Ensure nested objects exist to prevent controlled/uncontrolled warnings
    anti_detection: {
      ...defaultConfigValues.anti_detection,
      ...(scraper.config?.anti_detection || {}),
    },
    http_status: {
      ...defaultConfigValues.http_status,
      ...(scraper.config?.http_status || {}),
    },
    validation: {
      ...defaultConfigValues.validation,
      ...(scraper.config?.validation || {}),
    },
  };

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const isValidated = currentVersion?.status === 'validated';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <Form {...form}>
        <form className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b bg-background px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  {scraper.display_name || scraper.name}
                  <Badge variant={isValidated ? "default" : "secondary"}>
                    {isValidated ? 'Validated' : 'Draft'}
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground">{scraper.base_url}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SaveDraftButton configId={scraper.id} />
              <ValidateButton configId={scraper.id} />
              <PublishButton configId={scraper.id} isValidated={isValidated} />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col p-6 max-w-7xl mx-auto w-full">
              <ValidationSummary />
              
              <Tabs defaultValue="metadata" className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-7 mb-4">
                  <TabsTrigger value="metadata" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Metadata
                  </TabsTrigger>
                  <TabsTrigger value="selectors" className="gap-2">
                    <MousePointer2 className="h-4 w-4" />
                    Selectors
                  </TabsTrigger>
                  <TabsTrigger value="workflow" className="gap-2">
                    <GitMerge className="h-4 w-4" />
                    Workflow
                  </TabsTrigger>
                  <TabsTrigger value="config" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Config
                  </TabsTrigger>
                  <TabsTrigger value="advanced" className="gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Advanced
                  </TabsTrigger>
                  <TabsTrigger value="testing" className="gap-2">
                    <FlaskConical className="h-4 w-4" />
                    Testing
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto pr-2 pb-10">
                  <TabsContent value="metadata" className="mt-0">
                    <MetadataTab />
                  </TabsContent>

                  <TabsContent value="selectors" className="mt-0">
                    <SelectorsTab />
                  </TabsContent>

                  <TabsContent value="workflow" className="mt-0">
                    <WorkflowTab />
                  </TabsContent>

                  <TabsContent value="config" className="mt-0">
                    <ConfigurationTab />
                  </TabsContent>

                  <TabsContent value="advanced" className="mt-0">
                    <AdvancedTab />
                  </TabsContent>

                  <TabsContent value="testing" className="mt-0">
                    <TestingTab />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-0 h-full">
                    <PreviewTab />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
