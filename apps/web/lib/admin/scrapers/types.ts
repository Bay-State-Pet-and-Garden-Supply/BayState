import { z } from 'zod';
import {
  scraperConfigSchema,
  workflowStepSchema,
  selectorConfigSchema,
  SchemaVersion,
  NormalizationRule,
  AIConfig,
} from './schema';

type WorkflowStep = z.infer<typeof workflowStepSchema>;
type SelectorConfig = z.infer<typeof selectorConfigSchema>;

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
  file_path?: string | null;
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
  test_upcs?: string[];
  fake_upcs?: string[];
  edge_case_upcs?: string[];
  test_assertions?: Array<{
    upc: string;
    expected: Record<string, string>;
  }>;
  ai_config?: AIConfig;
  credential_refs?: string[];
}

export type ScraperConfigPayload = z.infer<typeof scraperConfigSchema>;
