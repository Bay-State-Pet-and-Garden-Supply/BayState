'use client';

import React, { useEffect } from 'react';
import { ScraperEditor } from './ScraperEditor';
import { useScraperEditorStore } from '@/lib/admin/scrapers/store';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

interface EditScraperClientProps {
  initialConfig: ScraperConfig;
}

export function EditScraperClient({ initialConfig }: EditScraperClientProps) {
  const { updateConfig, reset } = useScraperEditorStore();

  // Initialize store with existing config on mount
  useEffect(() => {
    console.log('Initializing EditScraperClient with config:', initialConfig);
    reset(); // Clear any previous state
    updateConfig(initialConfig);
    // Also set the active tab to 'settings' or 'workflow' as preferred
  }, [initialConfig, updateConfig, reset]);

  return <ScraperEditor />;
}
