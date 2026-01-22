
import { z } from 'zod';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';

// Extend base schema for form-specific needs if required
export const configFormSchema = scraperConfigSchema;

export type ConfigFormValues = z.infer<typeof configFormSchema>;

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
