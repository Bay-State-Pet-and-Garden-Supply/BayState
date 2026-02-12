import { z } from 'zod';

// --- Enums ---

export enum EventType {
  JOB_STARTED = 'JOB_STARTED',
  JOB_COMPLETED = 'JOB_COMPLETED',
  JOB_FAILED = 'JOB_FAILED',
  JOB_CANCELLED = 'JOB_CANCELLED',
  SCRAPER_STARTED = 'SCRAPER_STARTED',
  SCRAPER_COMPLETED = 'SCRAPER_COMPLETED',
  SCRAPER_FAILED = 'SCRAPER_FAILED',
  SCRAPER_BROWSER_INIT = 'SCRAPER_BROWSER_INIT',
  SCRAPER_BROWSER_RESTART = 'SCRAPER_BROWSER_RESTART',
  SKU_PROCESSING = 'SKU_PROCESSING',
  SKU_SUCCESS = 'SKU_SUCCESS',
  SKU_NOT_FOUND = 'SKU_NOT_FOUND',
  SKU_FAILED = 'SKU_FAILED',
  SKU_NO_RESULTS = 'SKU_NO_RESULTS',
  PROGRESS_UPDATE = 'PROGRESS_UPDATE',
  PROGRESS_WORKER = 'PROGRESS_WORKER',
  SELECTOR_FOUND = 'SELECTOR_FOUND',
  SELECTOR_MISSING = 'SELECTOR_MISSING',
  SYSTEM_WARNING = 'SYSTEM_WARNING',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SYSTEM_INFO = 'SYSTEM_INFO',
  DATA_SYNCED = 'DATA_SYNCED',
  DATA_SYNC_FAILED = 'DATA_SYNC_FAILED',
  LOGIN_SELECTOR_STATUS = 'LOGIN_SELECTOR_STATUS',
}

export enum EventSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

// --- Zod Schemas for ScraperConfig ---

export const SelectorConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  selector: z.string(),
  attribute: z.string().optional(),
  multiple: z.boolean().default(false),
  required: z.boolean().default(false),
});

export type SelectorConfig = z.infer<typeof SelectorConfigSchema>;

export const WorkflowStepSchema = z.object({
  action: z.string(),
  name: z.string(),
  params: z.record(z.string(), z.any()).default({}),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const LoginConfigSchema = z.object({
  url: z.string(),
  username_field: z.string(),
  password_field: z.string(),
  submit_button: z.string(),
  success_indicator: z.string(),
  failure_indicators: z.array(z.string()).default([]),
});

export type LoginConfig = z.infer<typeof LoginConfigSchema>;

export const HttpStatusConfigSchema = z.object({
  enabled: z.boolean().default(true),
  fail_on_error_status: z.boolean().default(true),
  error_status_codes: z.array(z.number()).default([]),
  warning_status_codes: z.array(z.number()).default([]),
});

export type HttpStatusConfig = z.infer<typeof HttpStatusConfigSchema>;

export const ValidationConfigSchema = z.object({
  no_results_selectors: z.array(z.string()).default([]),
  no_results_text_patterns: z.array(z.string()).default([]),
});

export type ValidationConfig = z.infer<typeof ValidationConfigSchema>;

export const NormalizationRuleSchema = z.object({
  field: z.string(),
  action: z.string(),
  params: z.record(z.string(), z.any()).default({}),
});

export type NormalizationRule = z.infer<typeof NormalizationRuleSchema>;

// AntiDetectionConfig is referenced in ScraperConfig but not detailed in the prompt's nested types.
// Using a permissive schema to ensure ScraperConfig is valid.
export const AntiDetectionConfigSchema = z.record(z.string(), z.any());

export type AntiDetectionConfig = z.infer<typeof AntiDetectionConfigSchema>;

export const ScraperConfigSchema = z.object({
  schema_version: z.literal('1.0'),
  name: z.string(),
  base_url: z.string(),
  display_name: z.string().nullable().optional(),
  selectors: z.array(SelectorConfigSchema),
  workflows: z.array(WorkflowStepSchema),
  normalization: z.array(NormalizationRuleSchema).nullable().optional(),
  login: LoginConfigSchema.nullable().optional(),
  timeout: z.number().default(30),
  retries: z.number().default(3),
  anti_detection: AntiDetectionConfigSchema.nullable().optional(),
  http_status: HttpStatusConfigSchema.nullable().optional(),
  validation: ValidationConfigSchema.nullable().optional(),
  test_skus: z.array(z.string()).nullable().optional(),
  fake_skus: z.array(z.string()).nullable().optional(),
  edge_case_skus: z.array(z.string()).nullable().optional(),
  image_quality: z.number().default(50),
});

export type ScraperConfig = z.infer<typeof ScraperConfigSchema>;

// --- Interfaces ---

export interface ScrapeJob {
  id: string;
  skus: string[];
  scrapers: string[];
  test_mode: boolean;
  max_workers: number;
  status: string;
  github_run_id: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_by: string | null;
}

export interface ScrapeJobChunk {
  chunk_id: string;
  job_id: string;
  chunk_index: number;
  skus: string[];
  scrapers: string[];
  test_mode: boolean;
  max_workers: number;
  lease_token: string | null;
  lease_expires_at: string | null;
}

export interface ScraperRunner {
  name: string;
  last_seen_at: string;
  status: 'online' | 'offline' | 'busy';
  current_job_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface ScraperEvent {
  event_type: EventType;
  timestamp: string;
  job_id: string;
  event_id: string;
  severity: EventSeverity;
  data: Record<string, any>;
}

export interface ScrapeResult {
  id: string;
  job_id: string;
  data: any;
  runner_name: string;
  created_at: string;
}
