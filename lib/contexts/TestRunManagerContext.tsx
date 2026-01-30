'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { TestRunRecord, TestRunStatus } from '@/lib/admin/scrapers/types';
import { useSupabaseRealtime } from '@/lib/hooks/useSupabaseRealtime';

// Constants
const MAX_SKUS = 50;
const LOCAL_STORAGE_KEY = 'test-lab-skus';
const MAX_HISTORICAL_RUNS = 100;

// Types
export type TestSkuType = 'golden' | 'fake' | 'edge';
export type TestSkuStatus = 'pending' | 'running' | 'success' | 'no_results' | 'error';

export interface TestSku {
  sku: string;
  type: TestSkuType;
  status?: TestSkuStatus;
  result?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface CurrentTestRun {
  id: string;
  scraperId: string;
  scraperName: string;
  status: TestRunStatus;
  startedAt: string;
  completedAt?: string;
  skus: TestSku[];
  passedCount: number;
  failedCount: number;
  error?: string;
}

export interface TestRunManagerState {
  currentRun: CurrentTestRun | null;
  historicalRuns: TestRunRecord[];
  selectedScraper: { id: string; name: string; displayName: string | null } | null;
  testSkus: TestSku[];
  isLoading: boolean;
  error: string | null;
  maxSkuError: string | null;
}

export interface TestRunManagerActions {
  startTest: (scraperId: string, scraperName: string, displayName: string | null) => Promise<void>;
  addSku: (sku: string, type: TestSkuType) => void;
  removeSku: (sku: string) => void;
  updateTestStatus: (sku: string, status: TestSkuStatus, result?: unknown, error?: string, durationMs?: number) => void;
  loadHistoricalRuns: () => Promise<void>;
  selectScraper: (scraperId: string, scraperName: string, displayName: string | null) => void;
  clearMaxSkuError: () => void;
  resetTestSkus: () => void;
}

export interface TestRunManagerContextValue extends TestRunManagerState, TestRunManagerActions {}

// Action Types for Reducer
type Action =
  | { type: 'SET_CURRENT_RUN'; payload: CurrentTestRun | null }
  | { type: 'SET_HISTORICAL_RUNS'; payload: TestRunRecord[] }
  | { type: 'ADD_SKU'; payload: TestSku }
  | { type: 'REMOVE_SKU'; payload: string }
  | { type: 'UPDATE_SKU_STATUS'; payload: { sku: string; status: TestSkuStatus; result?: unknown; error?: string; durationMs?: number } }
  | { type: 'SET_SELECTED_SCRAPER'; payload: { id: string; name: string; displayName: string | null } | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_MAX_SKU_ERROR'; payload: string | null }
  | { type: 'SET_TEST_SKUS'; payload: TestSku[] }
  | { type: 'RESET_TEST_SKUS' };

// Reducer
function testRunManagerReducer(state: TestRunManagerState, action: Action): TestRunManagerState {
  switch (action.type) {
    case 'SET_CURRENT_RUN':
      return { ...state, currentRun: action.payload };
    case 'SET_HISTORICAL_RUNS':
      return { ...state, historicalRuns: action.payload };
    case 'ADD_SKU':
      return { ...state, testSkus: [...state.testSkus, action.payload], maxSkuError: null };
    case 'REMOVE_SKU':
      return { ...state, testSkus: state.testSkus.filter(s => s.sku !== action.payload) };
    case 'UPDATE_SKU_STATUS': {
      const { sku, status, result, error, durationMs } = action.payload;
      return {
        ...state,
        testSkus: state.testSkus.map(s =>
          s.sku === sku
            ? { ...s, status, result, error, duration_ms: durationMs }
            : s
        ),
      };
    }
    case 'SET_SELECTED_SCRAPER':
      return { ...state, selectedScraper: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_MAX_SKU_ERROR':
      return { ...state, maxSkuError: action.payload };
    case 'SET_TEST_SKUS':
      return { ...state, testSkus: action.payload };
    case 'RESET_TEST_SKUS':
      return { ...state, testSkus: [] };
    default:
      return state;
  }
}

// Initial State
const initialState: TestRunManagerState = {
  currentRun: null,
  historicalRuns: [],
  selectedScraper: null,
  testSkus: [],
  isLoading: false,
  error: null,
  maxSkuError: null,
};

// Context
const TestRunManagerContext = createContext<TestRunManagerContextValue | null>(null);

// Provider Props
export interface TestRunManagerProviderProps {
  children: React.ReactNode;
  webSocketUrl?: string;
  apiKey?: string;
}

// Provider Component
export function TestRunManagerProvider({
  children,
  webSocketUrl,
  apiKey,
}: TestRunManagerProviderProps) {
  const [state, dispatch] = useReducer(testRunManagerReducer, initialState);
  const [isHydrated, setIsHydrated] = useState(false);

  // WebSocket integration
  const {
    subscribeToTest,
    lastSelectorEvent,
    lastLoginEvent,
    lastExtractionEvent,
  } = useSupabaseRealtime();

  // Load persisted SKUs from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const persisted = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (persisted) {
        const parsed = JSON.parse(persisted) as TestSku[];
        // Validate and limit to max
        const validSkus = parsed.slice(0, MAX_SKUS).filter(s => s.sku && s.type);
        dispatch({ type: 'SET_TEST_SKUS', payload: validSkus });
      }
    } catch (err) {
      console.error('Failed to load persisted SKUs:', err);
    }
    setIsHydrated(true);
  }, []);

  // Persist SKUs to localStorage whenever they change
  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.testSkus));
    } catch (err) {
      console.error('Failed to persist SKUs:', err);
    }
  }, [state.testSkus, isHydrated]);

  // Handle WebSocket events for real-time updates
  useEffect(() => {
    if (lastSelectorEvent && state.currentRun) {
      // Update SKU status based on selector validation events
      // This is a placeholder - actual implementation depends on event structure
      console.log('Selector validation event:', lastSelectorEvent);
    }
  }, [lastSelectorEvent, state.currentRun]);

  useEffect(() => {
    if (lastLoginEvent && state.currentRun) {
      console.log('Login status event:', lastLoginEvent);
    }
  }, [lastLoginEvent, state.currentRun]);

  useEffect(() => {
    if (lastExtractionEvent && state.currentRun) {
      console.log('Extraction result event:', lastExtractionEvent);
    }
  }, [lastExtractionEvent, state.currentRun]);

  // Actions
  const selectScraper = useCallback((scraperId: string, scraperName: string, displayName: string | null) => {
    dispatch({
      type: 'SET_SELECTED_SCRAPER',
      payload: { id: scraperId, name: scraperName, displayName },
    });
  }, []);

  const addSku = useCallback((sku: string, type: TestSkuType) => {
    const trimmedSku = sku.trim();
    if (!trimmedSku) return;

    // Check for duplicates
    const existing = state.testSkus.find(s => s.sku === trimmedSku);
    if (existing) {
      dispatch({ type: 'SET_ERROR', payload: `SKU "${trimmedSku}" already exists in test list` });
      return;
    }

    // Enforce max SKU limit
    if (state.testSkus.length >= MAX_SKUS) {
      dispatch({
        type: 'SET_MAX_SKU_ERROR',
        payload: `Maximum ${MAX_SKUS} SKUs allowed. Remove some SKUs before adding more.`,
      });
      return;
    }

    dispatch({
      type: 'ADD_SKU',
      payload: { sku: trimmedSku, type },
    });
    dispatch({ type: 'SET_ERROR', payload: null });
  }, [state.testSkus]);

  const removeSku = useCallback((sku: string) => {
    dispatch({ type: 'REMOVE_SKU', payload: sku });
  }, []);

  const updateTestStatus = useCallback((
    sku: string,
    status: TestSkuStatus,
    result?: unknown,
    error?: string,
    durationMs?: number
  ) => {
    dispatch({
      type: 'UPDATE_SKU_STATUS',
      payload: { sku, status, result, error, durationMs },
    });

    // Update current run counts if needed
    if (state.currentRun) {
      const updatedSkus = state.currentRun.skus.map(s =>
        s.sku === sku ? { ...s, status, result, error, duration_ms: durationMs } : s
      );
      const passedCount = updatedSkus.filter(s => s.status === 'success').length;
      const failedCount = updatedSkus.filter(s => s.status === 'error').length;
      
      dispatch({
        type: 'SET_CURRENT_RUN',
        payload: {
          ...state.currentRun,
          skus: updatedSkus,
          passedCount,
          failedCount,
        },
      });
    }
  }, [state.currentRun]);

  const startTest = useCallback(async (
    scraperId: string,
    scraperName: string,
    displayName: string | null
  ) => {
    if (state.testSkus.length === 0) {
      dispatch({ type: 'SET_ERROR', payload: 'No SKUs configured for test' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await fetch('/api/admin/scraper-network/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scraper_id: scraperId,
          skus: state.testSkus.map(s => s.sku),
          test_mode: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start test run');
      }

      const data = await response.json();

      // Create new test run
      const newRun: CurrentTestRun = {
        id: data.test_run_id || `manual-${Date.now()}`,
        scraperId,
        scraperName,
        status: 'running',
        startedAt: new Date().toISOString(),
        skus: state.testSkus.map(s => ({ ...s, status: 'pending' })),
        passedCount: 0,
        failedCount: 0,
      };

      dispatch({ type: 'SET_CURRENT_RUN', payload: newRun });

      // Subscribe to WebSocket updates for this test run
      if (data.test_run_id) {
        subscribeToTest(data.test_run_id);
      }
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to start test',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.testSkus, subscribeToTest]);

  const loadHistoricalRuns = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await fetch('/api/admin/scraper-network/test/runs?limit=' + MAX_HISTORICAL_RUNS);
      
      if (!response.ok) {
        throw new Error('Failed to load historical runs');
      }

      const data = await response.json();
      dispatch({ type: 'SET_HISTORICAL_RUNS', payload: data.runs || [] });
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to load historical runs',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const clearMaxSkuError = useCallback(() => {
    dispatch({ type: 'SET_MAX_SKU_ERROR', payload: null });
  }, []);

  const resetTestSkus = useCallback(() => {
    dispatch({ type: 'RESET_TEST_SKUS' });
  }, []);

  const value: TestRunManagerContextValue = {
    ...state,
    startTest,
    addSku,
    removeSku,
    updateTestStatus,
    loadHistoricalRuns,
    selectScraper,
    clearMaxSkuError,
    resetTestSkus,
  };

  return (
    <TestRunManagerContext.Provider value={value}>
      {children}
    </TestRunManagerContext.Provider>
  );
}

// Hook
export function useTestRunManager(): TestRunManagerContextValue {
  const context = useContext(TestRunManagerContext);
  if (!context) {
    throw new Error('useTestRunManager must be used within a TestRunManagerProvider');
  }
  return context;
}

// Export context for advanced use cases
export { TestRunManagerContext };
