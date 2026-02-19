/**
 * TypeScript types inferred from Zod schemas.
 * These types are used throughout the admin panel for scraper management.
 */
import { z } from 'zod';
import {
  scraperConfigSchema,
  scraperRecordSchema,
  testRunRecordSchema,
  selectorSuggestionSchema,
  workflowStepSchema,
  selectorConfigSchema,
  transformationSchema,
  extractFieldConfigSchema,
  actionTypeSchema,
  scraperTypeSchema,
  aiModelSchema,
  aiConfigSchema,
  aiSearchParamsSchema,
  aiExtractParamsSchema,
  aiValidateParamsSchema,
} from './schema';

// Core configuration types
export type ScraperConfig = z.infer<typeof scraperConfigSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type SelectorConfig = z.infer<typeof selectorConfigSchema>;
export type Transformation = z.infer<typeof transformationSchema>;
export type ExtractFieldConfig = z.infer<typeof extractFieldConfigSchema>;

export type AISearchParams = z.infer<typeof aiSearchParamsSchema>;
export type AIExtractParams = z.infer<typeof aiExtractParamsSchema>;
export type AIValidateParams = z.infer<typeof aiValidateParamsSchema>;

// Database record types
export type ScraperRecord = z.infer<typeof scraperRecordSchema>;
export type TestRunRecord = z.infer<typeof testRunRecordSchema>;
export type SelectorSuggestion = z.infer<typeof selectorSuggestionSchema>;

// Action types for workflow builder
export type ActionType = z.infer<typeof actionTypeSchema>;

// Status enum types for UI components
export type ScraperStatus = 'draft' | 'active' | 'disabled' | 'archived';
export type HealthStatus = 'healthy' | 'degraded' | 'broken' | 'unknown';
export type TestRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'partial' | 'cancelled';
export type TestType = 'manual' | 'scheduled' | 'health_check' | 'validation';

// Parameter definition for action parameters
export interface ActionParamDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'selector';
  label: string;
  required: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
}

// Action definition for workflow builder UI
export interface ActionDefinition {
  type: ActionType;
  label: string;
  icon: string;
  color: string;
  description: string;
  category: 'navigation' | 'interaction' | 'extraction' | 'transform' | 'validation' | 'flow' | 'ai';
  browserBound: boolean;
  params: Record<string, ActionParamDefinition>;
}

// UI-specific types
export interface ScraperListItem {
  id: string;
  name: string;
  display_name: string | null;
  base_url: string;
  status: ScraperStatus;
  health_status: HealthStatus;
  health_score: number;
  last_test_at: string | null;
  updated_at: string;
  workflow_count: number;
  selector_count: number;
}

export interface ScraperFormData {
  name: string;
  display_name?: string;
  base_url: string;
}

export interface ActionNodeData extends Record<string, unknown> {
  step: WorkflowStep;
  label: string;
  actionType: string;
  index: number;
}
