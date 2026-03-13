import { create } from 'zustand';
import { ScraperConfig } from './types';

interface ScraperEditorState {
  config: ScraperConfig;
  activeTab: 'workflow' | 'selectors' | 'settings' | 'yaml';
  
  // Viewing/Loading Actions
  updateConfig: (updates: Partial<ScraperConfig>) => void;
  setGeneralInfo: (info: Pick<ScraperConfig, 'name' | 'base_url' | 'display_name'>) => void;
  
  setActiveTab: (tab: 'workflow' | 'selectors' | 'settings' | 'yaml') => void;
  reset: () => void;
}

const initialConfig: ScraperConfig = {
  schema_version: '1.0',
  name: '',
  base_url: '',
  selectors: [],
  workflows: [],
  retries: 3,
  timeout: 30,
  image_quality: 50,
  test_skus: [],
  fake_skus: [],
  scraper_type: 'static',
  ai_config: undefined,
};

export const useScraperEditorStore = create<ScraperEditorState>((set) => ({
  config: initialConfig,
  activeTab: 'settings', // Start on settings to force name/url entry

  updateConfig: (updates) => set((state) => ({ 
    config: { ...state.config, ...updates } 
  })),

  setGeneralInfo: (info) => set((state) => ({
    config: { ...state.config, ...info }
  })),

  setActiveTab: (tab) => set({ activeTab: tab }),
  
  reset: () => set({ config: initialConfig, activeTab: 'settings' }),
}));
