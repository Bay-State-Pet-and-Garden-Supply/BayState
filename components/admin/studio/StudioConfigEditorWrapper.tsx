'use client';

import { useState, useCallback } from 'react';
import { ScraperConfig } from '../scrapers/ConfigList';
import { StudioConfigEditor } from './StudioConfigEditor';
import { StudioConfigListClient } from './StudioConfigListClient';
import { Skeleton } from '@/components/ui/skeleton';

interface ConfigEditorWrapperProps {
  configs: ScraperConfig[];
}

interface EditorState {
  isOpen: boolean;
  configId: string | null;
  configName: string;
}

export function StudioConfigEditorWrapper({ configs }: ConfigEditorWrapperProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    isOpen: false,
    configId: null,
    configName: '',
  });

  const [configData, setConfigData] = useState<{
    config: unknown;
    status: string;
    version: number;
    validationResult?: {
      valid: boolean;
      validated_at?: string;
      errors?: string[];
    } | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEdit = useCallback(async (config: ScraperConfig) => {
    setEditorState({
      isOpen: true,
      configId: config.id,
      configName: config.display_name,
    });
    setIsLoading(true);

    try {
      const response = await fetch(`/api/admin/scrapers/configs/${config.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      const data = await response.json();
      setConfigData(data);
    } catch (error) {
      console.error('Error fetching config:', error);
      setConfigData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setEditorState({
      isOpen: false,
      configId: null,
      configName: '',
    });
    setConfigData(null);
  }, []);

  if (editorState.isOpen) {
    if (isLoading) {
      return (
        <div className="flex flex-col h-full bg-background space-y-4 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-20" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <Skeleton className="h-[500px] w-full" />
          </div>
        </div>
      );
    }

    if (!configData || !editorState.configId) {
      return (
        <div className="flex flex-col h-full bg-background p-4">
          <div className="text-red-500">Failed to load configuration. <button onClick={handleClose} className="underline">Go back</button></div>
        </div>
      );
    }

    return (
      <StudioConfigEditor
        configId={editorState.configId}
        configName={editorState.configName}
        initialConfig={configData.config as any}
        initialStatus={configData.status}
        initialVersion={configData.version}
        initialValidationResult={configData.validationResult}
        onClose={handleClose}
      />
    );
  }

  return <StudioConfigListClient initialData={configs} onEdit={handleEdit} />;
}

export default StudioConfigEditorWrapper;
