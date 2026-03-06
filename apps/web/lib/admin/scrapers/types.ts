import { z } from 'zod';
import {
  scraperConfigSchema,
  scraperRecordSchema,
  selectorSuggestionSchema,
  workflowStepSchema,
  selectorConfigSchema,
  transformationSchema,
  extractFieldConfigSchema,
  actionTypeSchema,
  aiSearchParamsSchema,
  aiExtractParamsSchema,
  aiValidateParamsSchema,
  SchemaVersion,
  NormalizationRule,
  AIConfig,
} from './schema';

export interface ScraperConfig {
  id?: string;
  slug?: string;
  display_name?: string;
  domain?: string | null;
  base_url: string;
  scraper_type?: 'static' | 'agentic';
  schema_version: SchemaVersion;
  status?: 'draft' | 'active' | 'disabled' | 'archived';
  health_status?: 'healthy' | 'degraded' | 'broken' | 'unknown';
  health_score?: number;
  last_test_at?: string | null;
  last_test_result?: Record<string, unknown> | null;
  current_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  name?: string;
  selectors?: SelectorConfig[];
  workflows?: WorkflowStep[];
  normalization?: NormalizationRule[];
  login?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
  image_quality?: number;
  anti_detection?: Record<string, unknown>;
  http_status?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  test_skus?: string[];
  fake_skus?: string[];
  edge_case_skus?: string[];
  ai_config?: AIConfig;
}

export interface ScraperConfigVersion {
  id: string;
  config_id: string;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  change_summary: string | null;
  ai_config: Record<string, unknown> | null;
  anti_detection: Record<string, unknown> | null;
  validation_config: Record<string, unknown> | null;
  login_config: Record<string, unknown> | null;
  http_status_config: Record<string, unknown> | null;
  normalization_config: Record<string, unknown> | null;
  timeout: number;
  retries: number;
  image_quality: number;
  config: Record<string, unknown> | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ScraperSelector {
  id: string;
  version_id: string;
  name: string;
  selector: string;
  attribute: string;
  multiple: boolean;
  required: boolean;
  sort_order: number;
  created_at: string;
}

export interface ScraperWorkflowStep {
  id: string;
  version_id: string;
  action: string;
  name: string | null;
  params: Record<string, unknown>;
  sort_order: number;
  created_at: string;
}

export interface ScraperTestSku {
  id: string;
  config_id: string;
  sku: string;
  sku_type: 'test' | 'fake' | 'edge_case';
  added_by?: string | null;
  created_at: string;
}

export type ScraperConfigPayload = z.infer<typeof scraperConfigSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type SelectorConfig = z.infer<typeof selectorConfigSchema>;
export type Transformation = z.infer<typeof transformationSchema>;
export type ExtractFieldConfig = z.infer<typeof extractFieldConfigSchema>;
export type AISearchParams = z.infer<typeof aiSearchParamsSchema>;
export type AIExtractParams = z.infer<typeof aiExtractParamsSchema>;
export type AIValidateParams = z.infer<typeof aiValidateParamsSchema>;
export type ScraperRecord = z.infer<typeof scraperRecordSchema>;
export interface ScrapeJobTestRecord {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  test_metadata: {
    summary?: {
      passed: number;
      failed: number;
      total: number;
    };
    duration_ms?: number;
    sku_results?: Array<{
      sku: string;
      status: string;
    }>;
    [key: string]: any;
  } | null;
  skus: string[] | null;
  error_message: string | null;
  started_at?: string; // mapped from created_at
  duration_ms?: number; // mapped from metadata
}
export type SelectorSuggestion = z.infer<typeof selectorSuggestionSchema>;
export type ActionType = z.infer<typeof actionTypeSchema>;
export type ScraperStatus = 'draft' | 'active' | 'disabled' | 'archived';
export type HealthStatus = 'healthy' | 'degraded' | 'broken' | 'unknown';
export type TestRunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'partial' | 'cancelled';
export type TestType = 'manual' | 'scheduled' | 'health_check' | 'validation';

export interface TestRunStep {
  id: string;
  test_run_id: string; // Map to job_id or chunk_id
  step_index: number;
  action_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ActionParamDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'selector';
  label: string;
  required: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
}

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
