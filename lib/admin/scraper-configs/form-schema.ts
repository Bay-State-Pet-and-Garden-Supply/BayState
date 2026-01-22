import { z } from 'zod';
import { scraperConfigSchema } from '../scrapers/schema';

/**
 * Form schema for the scraper config editor.
 * Explicitly defines all types to ensure proper type inference for RHF.
 */
export const configFormSchema = z.object({
  schema_version: z.literal("1.0"),
  name: z.string().min(1, 'Scraper name is required'),
  display_name: z.string().optional(),
  base_url: z.string().url('Must be a valid URL'),
  selectors: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Selector name is required'),
    selector: z.string().min(1, 'Selector is required'),
    attribute: z.enum(['text', 'src', 'href', 'value', 'innerHTML', 'innerText', 'alt', 'title']).default('text'),
    multiple: z.boolean().default(false),
    required: z.boolean().default(true),
  })).default([]),
  workflows: z.array(z.object({
    action: z.string().min(1, 'Action is required'),
    name: z.string().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  })).default([]),
  normalization: z.array(z.object({
    field: z.string(),
    action: z.enum(['title_case', 'lowercase', 'uppercase', 'trim', 'remove_prefix', 'extract_weight']),
    params: z.record(z.string(), z.unknown()).default({}),
  })).optional(),
  login: z.object({
    url: z.string(),
    username_field: z.string(),
    password_field: z.string(),
    submit_button: z.string(),
    success_indicator: z.string().optional(),
    failure_indicators: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  timeout: z.number().default(30),
  retries: z.number().default(3),
  image_quality: z.number().min(0).max(100).default(50),
  anti_detection: z.object({
    enable_captcha_detection: z.boolean().default(false),
    enable_rate_limiting: z.boolean().default(false),
    enable_human_simulation: z.boolean().default(false),
    enable_session_rotation: z.boolean().default(false),
    enable_blocking_handling: z.boolean().default(false),
    rate_limit_min_delay: z.number().default(1.0),
    rate_limit_max_delay: z.number().default(3.0),
    session_rotation_interval: z.number().default(100),
    max_retries_on_detection: z.number().default(3),
  }).optional(),
  http_status: z.object({
    enabled: z.boolean().default(false),
    fail_on_error_status: z.boolean().default(true),
    error_status_codes: z.array(z.number()).default([400, 401, 403, 404, 500, 502, 503, 504]),
    warning_status_codes: z.array(z.number()).default([301, 302, 307, 308]),
  }).optional(),
  validation: z.object({
    no_results_selectors: z.array(z.string()).optional(),
    no_results_text_patterns: z.array(z.string()).optional(),
  }).optional(),
  test_skus: z.array(z.string()).default([]),
  fake_skus: z.array(z.string()).default([]),
  edge_case_skus: z.array(z.string()).optional(),
});

export type ConfigFormValues = z.infer<typeof configFormSchema>;

/**
 * Default values for a new scraper config
 */
export const defaultConfigValues: ConfigFormValues = {
  schema_version: '1.0',
  name: '',
  display_name: undefined,
  base_url: '',
  selectors: [],
  workflows: [],
  normalization: [],
  login: undefined,
  timeout: 30,
  retries: 3,
  image_quality: 50,
  anti_detection: {
    enable_captcha_detection: false,
    enable_rate_limiting: false,
    enable_human_simulation: false,
    enable_session_rotation: false,
    enable_blocking_handling: false,
    rate_limit_min_delay: 1.0,
    rate_limit_max_delay: 3.0,
    session_rotation_interval: 100,
    max_retries_on_detection: 3,
  },
  http_status: {
    enabled: false,
    fail_on_error_status: true,
    error_status_codes: [400, 401, 403, 404, 500, 502, 503, 504],
    warning_status_codes: [301, 302, 307, 308],
  },
  validation: {
    no_results_selectors: [],
    no_results_text_patterns: [],
  },
  test_skus: [],
  fake_skus: [],
  edge_case_skus: undefined,
};

/**
 * Selector form default values
 */
export const defaultSelectorValues = {
  id: '',
  name: '',
  selector: '',
  attribute: 'text' as const,
  multiple: false,
  required: true,
};

/**
 * Workflow step form default values
 */
export const defaultWorkflowStepValues = {
  action: '',
  name: '',
  params: {},
};
