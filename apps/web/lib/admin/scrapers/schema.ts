// Known schema versions - must be kept in sync with Python Pydantic model
import { z } from 'zod';
import { AI_MODEL_VALUES, DEFAULT_AI_MODEL } from '@/lib/ai-scraping/models';

const KNOWN_SCHEMA_VERSIONS = ["1.0"] as const;

export type SchemaVersion = (typeof KNOWN_SCHEMA_VERSIONS)[number];

const schemaVersionSchema = z.enum(KNOWN_SCHEMA_VERSIONS);

// ============================================================================
// AI SCRAPER TYPES
// ============================================================================

const scraperTypeSchema = z.enum(['static', 'agentic']);

const aiModelSchema = z.enum(AI_MODEL_VALUES);

const aiConfigSchema = z.object({
  tool: z.enum(['browser-use', 'crawl4ai']).default('crawl4ai'),
  task: z.string().min(1, 'AI task description is required'),
  max_steps: z.number().min(1).max(50).default(10),
  confidence_threshold: z.number().min(0).max(1).default(0.7),
  llm_model: aiModelSchema.default(DEFAULT_AI_MODEL),
  use_vision: z.boolean().default(true),
  headless: z.boolean().default(true),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;

// Transform types supported by the extract_and_transform action
const transformTypeSchema = z.enum([
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

const transformationSchema = z.object({
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
}).strict();

// Workflow step parameter schemas for different action types
const navigateParamsSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  wait_after: z.number().optional(),
  fail_on_error: z.boolean().optional(),
});

const clickParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  filter_text: z.string().optional(),
  filter_text_exclude: z.string().optional(),
  index: z.number().default(0),
  wait_after: z.number().optional(),
  max_retries: z.number().optional(),
});

const waitForParamsSchema = z.object({
  selector: z.union([z.string(), z.array(z.string())]),
  timeout: z.number().default(10),
});

const waitParamsSchema = z.object({
  seconds: z.number().optional(),
  duration: z.number().optional(),
});

const extractParamsSchema = z.object({
  fields: z.array(z.string()).optional(),
  selector_ids: z.array(z.string()).optional(),
});

// Field config for extract_and_transform action
const extractFieldConfigSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  selector: z.string().min(1, 'Selector is required'),
  attribute: z.string().optional(),
  multiple: z.boolean().optional(),
  required: z.boolean().optional(),
  transform: z.array(transformationSchema).optional(),
});

const extractAndTransformParamsSchema = z.object({
  fields: z.array(extractFieldConfigSchema),
});

const transformValueParamsSchema = z.object({
  field: z.string().optional(),
  source_field: z.string().optional(),
  target_field: z.string().optional(),
  regex: z.string().optional(),
  transformations: z.array(transformationSchema).optional(),
});

const conditionalClickParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  timeout: z.number().default(2),
});

const conditionalSkipParamsSchema = z.object({
  if_flag: z.string().min(1, 'Flag name is required'),
});

const inputTextParamsSchema = z.object({
  selector: z.string().min(1, 'Selector is required'),
  text: z.string(),
  clear_first: z.boolean().optional(),
});

const scrollParamsSchema = z.object({
  direction: z.enum(['up', 'down', 'top', 'bottom']).optional(),
  amount: z.number().optional(),
  selector: z.string().optional(),
});

const verifyParamsSchema = z.object({
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
const validationConfigSchema = z.object({
  no_results_selectors: z.array(z.string()).optional(),
  no_results_text_patterns: z.array(z.string()).optional(),
});

// Anti-detection config
const antiDetectionConfigSchema = z.object({
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
const httpStatusConfigSchema = z.object({
  enabled: z.boolean().default(false),
  fail_on_error_status: z.boolean().default(true),
  error_status_codes: z.array(z.number()).default([400, 401, 403, 404, 500, 502, 503, 504]),
  warning_status_codes: z.array(z.number()).default([301, 302, 307, 308]),
});

// Login config - all fields optional since not all scrapers need login
const loginConfigSchema = z.object({
  url: z.string().optional(),
  username_field: z.string().optional(),
  password_field: z.string().optional(),
  submit_button: z.string().optional(),
  success_indicator: z.string().optional(),
  failure_indicators: z.record(z.string(), z.unknown()).optional(),
});

// Normalization rule
const normalizationRuleSchema = z.object({
  field: z.string(),
  action: z.enum(['title_case', 'lowercase', 'uppercase', 'trim', 'remove_prefix', 'extract_weight']),
  params: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizationRule = z.infer<typeof normalizationRuleSchema>;

const skuAssertionSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  expected: z.object({
    name: z.string().optional(),
    price: z.string().optional(),
    image: z.string().optional(),
  }).catchall(z.string().nullable().optional()),
});

// OCR config for image text extraction
const ocrConfigSchema = z.object({
  enabled: z.boolean().default(false),
  max_images: z.number().min(1).max(10).default(2),
  language: z.string().default('eng'),
  preprocess: z.boolean().default(true),
});

type OcrConfig = z.infer<typeof ocrConfigSchema>;

// Full scraper config schema
export const scraperConfigSchema = z.object({
  schema_version: schemaVersionSchema,
  name: z.string().min(1, 'Scraper name is required'),
  display_name: z.string().optional(),
  base_url: z.string().url('Must be a valid URL'),
  scraper_type: scraperTypeSchema.default('static'),
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
  test_assertions: z.array(skuAssertionSchema).optional(),
  ai_config: aiConfigSchema.optional(),
  ocr_config: ocrConfigSchema.optional(),
});

// ============================================================================
// NORMALIZED SCHEMA ZOD SCHEMAS (from scraper-schema-overhaul)
// ============================================================================

// Selector for normalized table
const scraperSelectorSchema = z.object({
  name: z.string().min(1, 'Selector name is required'),
  selector: z.string().min(1, 'Selector is required'),
  attribute: z.string().default('text'),
  multiple: z.boolean().default(false),
  required: z.boolean().default(true),
});

// Workflow step for normalized table
const scraperWorkflowStepSchema = z.object({
  action: z.string().min(1, 'Action is required'),
  name: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

// Scraper config metadata (for forms)
const scraperConfigMetadataSchema = z.object({
  slug: z.string().min(1, 'Slug is required').max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  display_name: z.string().optional(),
  base_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  domain: z.string().optional(),
  scraper_type: z.enum(['static', 'agentic']).default('static'),
});

// Settings for version (timeout, retries, etc.)
const scraperVersionSettingsSchema = z.object({
  timeout: z.number().min(1).max(300).default(30),
  retries: z.number().min(0).max(10).default(3),
  image_quality: z.number().min(0).max(100).default(50),
});

// Test SKU schema
const scraperTestSkuSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  sku_type: z.enum(['test', 'fake', 'edge_case']),
});
