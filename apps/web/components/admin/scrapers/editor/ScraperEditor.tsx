'use client';

import React, { useState } from 'react';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Save, Play, Download, Loader2 } from 'lucide-react';
import { GlobalSettings } from './GlobalSettings';
import { WorkflowBuilder } from './WorkflowBuilder';
import { YamlPreview } from './YamlPreview';
import { SelectorsEditor } from './SelectorsEditor';

import { YamlImportDialog } from './YamlImportDialog';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import YAML from 'yaml';

export function ScraperEditor() {
  const { activeTab, setActiveTab, config } = useScraperEditorStore();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/scrapers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success('Scraper configuration saved successfully');
      router.push('/admin/scrapers');
    } catch (e) {
      toast.error('Failed to save scraper: ' + (e as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const yamlStr = YAML.stringify(config);
    const blob = new Blob([yamlStr], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name || 'scraper_config'}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Configuration downloaded');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header Toolbar */}
      <div className="border-b p-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">
            {config.name || 'New Scraper'}
            {config.display_name && <span className="text-muted-foreground text-sm ml-2">({config.display_name})</span>}
          </h1>
        </div>

          <div className="flex items-center gap-2">
            <YamlImportDialog />
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export YAML
            </Button>
            <Button variant="secondary" size="sm">
              <Play className="mr-2 h-4 w-4" /> Test Run
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save Scraper
                </>
              )}
            </Button>
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'selectors' | 'settings' | 'workflow' | 'yaml')}
          className="h-full flex flex-col"
        >
          <div className="px-4 border-b bg-muted/40 shrink-0">
            <TabsList className="h-12 bg-transparent">
              <TabsTrigger value="settings" className="data-[state=active]:bg-background">
                Settings
              </TabsTrigger>
              <TabsTrigger value="selectors" className="data-[state=active]:bg-background">
                Selectors
              </TabsTrigger>
              <TabsTrigger value="workflow" className="data-[state=active]:bg-background">
                Workflow Builder
              </TabsTrigger>
              <TabsTrigger value="yaml" className="data-[state=active]:bg-background">
                YAML Preview
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6 bg-muted/10">
            <TabsContent value="settings" className="m-0 max-w-4xl mx-auto">
              <GlobalSettings />
            </TabsContent>

            <TabsContent value="selectors" className="m-0 max-w-5xl mx-auto">
              <SelectorsEditor />
            </TabsContent>

            <TabsContent value="workflow" className="m-0">
              <WorkflowBuilder />
            </TabsContent>

            <TabsContent value="yaml" className="m-0">
              <YamlPreview />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
