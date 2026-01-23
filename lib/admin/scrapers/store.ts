import { create } from 'zustand';
import { 
  ScraperConfig, 
  WorkflowStep, 
  ActionType, 
  SelectorConfig 
} from './types';
import { v4 as uuidv4 } from 'uuid';

interface ScraperEditorState {
  config: ScraperConfig;
  activeTab: 'workflow' | 'selectors' | 'settings' | 'yaml';
  
  // Actions
  updateConfig: (updates: Partial<ScraperConfig>) => void;
  setGeneralInfo: (info: Pick<ScraperConfig, 'name' | 'base_url' | 'display_name'>) => void;
  
  // Workflow Actions
  addWorkflowStep: (actionType: ActionType, index?: number) => void;
  updateWorkflowStep: (index: number, updates: Partial<WorkflowStep>) => void;
  removeWorkflowStep: (index: number) => void;
  moveWorkflowStep: (fromIndex: number, toIndex: number) => void;
  
  // Selector Actions - now use ID-based operations
  addSelector: (selector: SelectorConfig) => void;
  updateSelector: (id: string, updates: Partial<SelectorConfig>) => void;
  removeSelector: (id: string) => void;
  
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

  addWorkflowStep: (actionType, index) => set((state) => {
    const newStep: WorkflowStep = {
      action: actionType,
      params: {},
    };
    
    // Default params based on action type
    if (actionType === 'wait') newStep.params = { seconds: 2 };
    if (actionType === 'navigate') newStep.params = { url: '' };
    if (actionType === 'click') newStep.params = { selector: '' };
    if (actionType === 'wait_for') newStep.params = { selector: '', timeout: 10 };
    
    const newWorkflows = [...state.config.workflows];
    if (index !== undefined && index >= 0) {
      newWorkflows.splice(index, 0, newStep);
    } else {
      newWorkflows.push(newStep);
    }
    
    return { config: { ...state.config, workflows: newWorkflows } };
  }),

  updateWorkflowStep: (index, updates) => set((state) => {
    const newWorkflows = [...state.config.workflows];
    if (newWorkflows[index]) {
      newWorkflows[index] = { ...newWorkflows[index], ...updates };
    }
    return { config: { ...state.config, workflows: newWorkflows } };
  }),

  removeWorkflowStep: (index) => set((state) => {
    const newWorkflows = state.config.workflows.filter((_, i) => i !== index);
    return { config: { ...state.config, workflows: newWorkflows } };
  }),

  moveWorkflowStep: (fromIndex, toIndex) => set((state) => {
    const newWorkflows = [...state.config.workflows];
    const [movedStep] = newWorkflows.splice(fromIndex, 1);
    newWorkflows.splice(toIndex, 0, movedStep);
    return { config: { ...state.config, workflows: newWorkflows } };
  }),

  addSelector: (selector) => set((state) => {
    // Ensure selector has a stable ID for React keys
    const selectorWithId = selector.id ? selector : { ...selector, id: uuidv4() };
    return {
      config: {
        ...state.config,
        selectors: [...state.config.selectors, selectorWithId]
      }
    };
  }),

  updateSelector: (id, updates) => set((state) => {
    // Handle both UUID-based IDs and index-based fallback (selector-N format)
    const newSelectors = state.config.selectors.map((sel, index) => {
      // Check if ID matches actual ID or matches the fallback format
      const isMatch = sel.id === id || `selector-${index}` === id;
      if (isMatch) {
        // If this is an old selector without an ID, assign one now
        if (!sel.id) {
          return { ...sel, ...updates, id: uuidv4() };
        }
        return { ...sel, ...updates };
      }
      return sel;
    });
    return { config: { ...state.config, selectors: newSelectors } };
  }),

  removeSelector: (id) => set((state) => {
    // Handle both UUID-based IDs and index-based fallback (selector-N format)
    const newSelectors = state.config.selectors.filter((sel, index) => {
      // Keep if ID doesn't match
      const isMatch = sel.id === id || `selector-${index}` === id;
      return !isMatch;
    });
    return { config: { ...state.config, selectors: newSelectors } };
  }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  
  reset: () => set({ config: initialConfig, activeTab: 'settings' }),
}));
