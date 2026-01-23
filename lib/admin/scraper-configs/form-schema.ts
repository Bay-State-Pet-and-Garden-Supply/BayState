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
 * Workflow step form default values
 */
export const defaultWorkflowStepValues = {
  action: '',
  name: '',
  params: {},
};

/**
 * Selector definition (for migration from old format)
 */
interface LegacySelector {
  id?: string;
  name: string;
  selector: string;
  attribute?: 'text' | 'src' | 'href' | 'value' | 'innerHTML' | 'innerText' | 'alt' | 'title';
  multiple?: boolean;
  required?: boolean;
}

/**
 * Migrate legacy config format (with global selectors) to new format (inline extract_and_transform)
 * 
 * OLD FORMAT:
 * {
 *   "selectors": [
 *     {"name": "Name", "selector": "#title", "attribute": "text"},
 *     {"name": "Price", "selector": ".price", "attribute": "innerText"}
 *   ],
 *   "workflows": [
 *     {"action": "extract", "params": {"fields": ["Name", "Price"]}}
 *   ]
 * }
 * 
 * NEW FORMAT:
 * {
 *   "workflows": [
 *     {"action": "extract_and_transform", "params": {"fields": [
 *       {"name": "Name", "selector": "#title", "attribute": "text"},
 *       {"name": "Price", "selector": ".price", "attribute": "innerText"}
 *     ]}}
 *   ]
 * }
 */
export function migrateLegacyConfig(config: Record<string, unknown>): Record<string, unknown> {
  // Skip if already migrated (no selectors array)
  if (!Array.isArray((config as Record<string, unknown>).selectors)) {
    return config;
  }

  const selectors = ((config as Record<string, unknown>).selectors || []) as LegacySelector[];
  const workflows = ((config as Record<string, unknown>).workflows || []) as Array<{
    action: string;
    name?: string;
    params: Record<string, unknown>;
  }>;

  // Build selector lookup by name
  const selectorByName = new Map<string, LegacySelector>();
  selectors.forEach((s) => {
    if (s.name) {
      selectorByName.set(s.name, s);
    }
  });

  // Migrate workflows
  const migratedWorkflows = workflows.map((step) => {
    // Only migrate 'extract' actions that reference selectors
    if (step.action !== 'extract') {
      return step;
    }

    const fields = step.params.fields as string[] | undefined;
    const selectorIds = step.params.selector_ids as string[] | undefined;

    if (!fields && !selectorIds) {
      return step;
    }

    // Combine field names and selector_ids
    const fieldNames = [...(fields || []), ...(selectorIds || [])];

    // Build inline field configs
    const inlineFields = fieldNames
      .map((name) => {
        const selector = selectorByName.get(name);
        if (!selector) {
          // Selector not found, return basic field config
          return { name, selector: '', attribute: 'text' as const };
        }
        return {
          name: selector.name,
          selector: selector.selector,
          attribute: selector.attribute || 'text',
          multiple: selector.multiple,
          required: selector.required,
        };
      })
      .filter((f) => f.name && f.selector);

    if (inlineFields.length === 0) {
      return step;
    }

    // Return extract_and_transform action with inline fields
    return {
      action: 'extract_and_transform',
      name: step.name || 'Extract data',
      params: { fields: inlineFields },
    };
  });

  // Return new config without selectors
  return {
    ...config,
    workflows: migratedWorkflows,
    // Remove selectors from config
    selectors: undefined,
  };
}
