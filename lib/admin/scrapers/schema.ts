// Known schema versions - must be kept in sync with Python Pydantic model
import { z } from 'zod';

const KNOWN_SCHEMA_VERSIONS = ["1.0"] as const;

export type SchemaVersion = (typeof KNOWN_SCHEMA_VERSIONS)[number];

export const schemaVersionSchema = z.enum(KNOWN_SCHEMA_VERSIONS);

// Transform types supported by the extract_and_transform action
export const transformTypeSchema = z.enum([
  'replace',
  'strip',
  'lower',
  'upper',
  'title',
  'regex_extract',
  'prefix',
  'suffix',
  'default',
]);

export const transformationSchema = z.object({
  type: transformTypeSchema,
  pattern: z.string().optional(),
  replacement: z.string().optional(),
  chars: z.string().optional(),
  group: z.number().optional(),
  value: z.string().optional(),
});

export const selectorConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Selector name is required'),
  selector: z.string().min(1, 'Selector is required'),
  attribute: z.enum(['text', 'src', 'href', 'value', 'innerHTML', 'innerText', 'alt', 'title']).default('text'),
  multiple: z.boolean().default(false),
  required: z.boolean().default(true),
});

// Workflow step parameter schemas for different action types
export const navigateParamsSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  wait_after: z.number().optional(),
  fail_on_error: z.boolean().optional(),
});

export const clickParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  filter_text: z.string().optional(),
  filter_text_exclude: z.string().optional(),
  index: z.number().default(0),
  wait_after: z.number().optional(),
  max_retries: z.number().optional(),
});

export const waitForParamsSchema = z.object({
  selector: z.union([z.string(), z.array(z.string())]),
  timeout: z.number().default(10),
});

export const waitParamsSchema = z.object({
  seconds: z.number().optional(),
  duration: z.number().optional(),
});

export const extractParamsSchema = z.object({
  fields: z.array(z.string()).optional(),
  selector_ids: z.array(z.string()).optional(),
});

// Field config for extract_and_transform action
export const extractFieldConfigSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  selector: z.string().min(1, 'Selector is required'),
  attribute: z.string().optional(),
  multiple: z.boolean().optional(),
  required: z.boolean().optional(),
  transform: z.array(transformationSchema).optional(),
});

export const extractAndTransformParamsSchema = z.object({
  fields: z.array(extractFieldConfigSchema),
});

export const transformValueParamsSchema = z.object({
  field: z.string().optional(),
  source_field: z.string().optional(),
  target_field: z.string().optional(),
  regex: z.string().optional(),
  transformations: z.array(transformationSchema).optional(),
});

export const conditionalClickParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  timeout: z.number().default(2),
});

export const conditionalSkipParamsSchema = z.object({
  if_flag: z.string().min(1, 'Flag name is required'),
});

export const inputTextParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  text: z.string(),
  clear_first: z.boolean().optional(),
});

export const scrollParamsSchema = z.object({
  direction: z.enum(['up', 'down', 'top', 'bottom']).optional(),
  amount: z.number().optional(),
  selector: z.string().optional(),
});

export const verifyParamsSchema = z.object({
  selector: z.string(),
  expected_value: z.string(),
  attribute: z.string().optional(),
  match_mode: z.enum(['exact', 'contains', 'fuzzy_number']).optional(),
});

// Base workflow step schema
export const workflowStepSchema = z.object({
  action: z.string().min(1, 'Action is required'),
  name: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

// Validation config for no-results detection
export const validationConfigSchema = z.object({
  no_results_selectors: z.array(z.string()).optional(),
  no_results_text_patterns: z.array(z.string()).optional(),
});

// Anti-detection config
export const antiDetectionConfigSchema = z.object({
  enable_captcha_detection: z.boolean().default(false),
  enable_rate_limiting: z.boolean().default(false),
  enable_human_simulation: z.boolean().default(false),
  enable_session_rotation: z.boolean().default(false),
  enable_blocking_handling: z.boolean().default(false),
  rate_limit_min_delay: z.number().default(1.0),
  rate_limit_max_delay: z.number().default(3.0),
  session_rotation_interval: z.number().default(100),
  max_retries_on_detection: z.number().default(3),
});

// HTTP status config
export const httpStatusConfigSchema = z.object({
  enabled: z.boolean().default(false),
  fail_on_error_status: z.boolean().default(true),
  error_status_codes: z.array(z.number()).default([400, 401, 403, 404, 500, 502, 503, 504]),
  warning_status_codes: z.array(z.number()).default([301, 302, 307, 308]),
});

// Login config
export const loginConfigSchema = z.object({
  url: z.string(),
  username_field: z.string(),
  password_field: z.string(),
  submit_button: z.string(),
  success_indicator: z.string().optional(),
  failure_indicators: z.record(z.string(), z.unknown()).optional(),
});

// Normalization rule
export const normalizationRuleSchema = z.object({
  field: z.string(),
  action: z.enum(['title_case', 'lowercase', 'uppercase', 'trim', 'remove_prefix', 'extract_weight']),
  params: z.record(z.string(), z.unknown()).default({}),
});

// Full scraper config schema
export const scraperConfigSchema = z.object({
  schema_version: schemaVersionSchema,
  name: z.string().min(1, 'Scraper name is required'),
  display_name: z.string().optional(),
  base_url: z.string().url('Must be a valid URL'),
  selectors: z.array(selectorConfigSchema).default([]),
  workflows: z.array(workflowStepSchema).default([]),
  normalization: z.array(normalizationRuleSchema).optional(),
  login: loginConfigSchema.optional(),
  timeout: z.number().default(30),
  retries: z.number().default(3),
  image_quality: z.number().min(0).max(100).default(50),
  anti_detection: antiDetectionConfigSchema.optional(),
  http_status: httpStatusConfigSchema.optional(),
  validation: validationConfigSchema.optional(),
  test_skus: z.array(z.string()).default([]),
  fake_skus: z.array(z.string()).default([]),
  edge_case_skus: z.array(z.string()).optional(),
});

// Database record schemas
export const scraperRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  base_url: z.string(),
  config: scraperConfigSchema,
  status: z.enum(['draft', 'active', 'disabled', 'archived']),
  health_status: z.enum(['healthy', 'degraded', 'broken', 'unknown']),
  health_score: z.number(),
  last_test_at: z.string().nullable(),
  last_test_result: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().uuid().nullable(),
});

export const testRunResultSchema = z.object({
  sku: z.string(),
  sku_type: z.enum(['test', 'fake', 'edge_case']),
  status: z.enum(['success', 'no_results', 'error', 'timeout']),
  data: z.record(z.string(), z.unknown()).optional(),
  error_message: z.string().optional(),
  duration_ms: z.number().optional(),
});

export const testRunRecordSchema = z.object({
  id: z.string().uuid(),
  scraper_id: z.string().uuid(),
  test_type: z.enum(['manual', 'scheduled', 'health_check', 'validation']),
  skus_tested: z.array(z.string()),
  results: z.array(testRunResultSchema),
  status: z.enum(['pending', 'running', 'passed', 'failed', 'partial', 'cancelled']),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  runner_name: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  triggered_by: z.string().uuid().nullable(),
});

export const selectorSuggestionSchema = z.object({
  id: z.string().uuid(),
  scraper_id: z.string().uuid().nullable(),
  target_url: z.string(),
  target_description: z.string(),
  suggested_selector: z.string(),
  selector_type: z.enum(['css', 'xpath']),
  alternatives: z.array(z.object({
    selector: z.string(),
    type: z.enum(['css', 'xpath']),
    confidence: z.number(),
    reasoning: z.string().optional(),
  })).optional(),
  confidence: z.number().nullable(),
  llm_model: z.string().nullable(),
  verified: z.boolean(),
  verified_at: z.string().nullable(),
  created_at: z.string(),
});

// Action types enum for workflow builder
export const actionTypes = [
  'navigate',
  'wait',
  'wait_for',
  'click',
  'conditional_click',
  'input_text',
  'extract',
  'extract_and_transform',
  'transform_value',
  'check_no_results',
  'conditional_skip',
  'conditional',
  'scroll',
  'verify',
  'login',
  'execute_script',
  'process_images',
  'combine_fields',
  'parse_weight',
  'extract_from_json',
] as const;

export const actionTypeSchema = z.enum(actionTypes);
