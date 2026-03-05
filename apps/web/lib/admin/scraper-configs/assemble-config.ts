/**
 * Scraper Config Assembly Utility
 * 
 * Assembles the normalized database schema back into the flat ScraperConfig JSON
 * format expected by the Python runner.
 * 
 * This provides backward compatibility with the Python ScraperConfig Pydantic model
 * while using the normalized tables (scraper_selectors, scraper_workflow_steps, etc.)
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Types - Matching Python ScraperConfig Model
// ============================================================================

export interface SelectorConfig {
  name: string;
  selector: string;
  attribute: string | null;
  multiple: boolean;
  required: boolean;
}

export interface WorkflowStep {
  action: string;
  name: string | null;
  params: Record<string, unknown>;
}

export interface LoginConfig {
  url: string;
  username_field: string;
  password_field: string;
  submit_button: string;
  success_indicator?: string;
  failure_indicators?: Record<string, unknown>;
}

export interface HttpStatusConfig {
  enabled: boolean;
  fail_on_error_status: boolean;
  error_status_codes: number[];
  warning_status_codes: number[];
}

export interface ValidationConfig {
  no_results_selectors: string[] | null;
  no_results_text_patterns: string[] | null;
}

export interface AIConfig {
  tool: 'browser-use';
  task: string;
  max_steps: number;
  confidence_threshold: number;
  llm_model: string;
  use_vision: boolean;
  headless: boolean;
}

export interface AntiDetectionConfig {
  enable_captcha_detection?: boolean;
  rate_limit_min_delay?: number;
  // Additional anti-detection settings as needed
  [key: string]: unknown;
}

export interface NormalizationRule {
  field: string;
  action: string;
  params: Record<string, unknown>;
}

export interface ScraperConfigPayload {
  schema_version: string;
  name: string;
  display_name: string | null;
  base_url: string;
  scraper_type: 'static' | 'agentic';
  selectors: SelectorConfig[];
  workflows: WorkflowStep[];
  ai_config: AIConfig | null;
  anti_detection: AntiDetectionConfig | null;
  validation: ValidationConfig | null;
  login: LoginConfig | null;
  http_status: HttpStatusConfig | null;
  normalization: NormalizationRule[] | null;
  timeout: number;
  retries: number;
  image_quality: number;
  test_skus: string[];
  fake_skus: string[];
  edge_case_skus: string[];
}

// ============================================================================
// Internal Types (Database)
// ============================================================================

interface DbScraperConfig {
  id: string;
  slug: string;
  display_name: string | null;
  domain: string | null;
  base_url: string | null;
  scraper_type: string;
  schema_version: string;
  status: string;
  current_version_id: string | null;
}

interface DbScraperConfigVersion {
  id: string;
  config_id: string;
  version_number: number;
  status: string;
  schema_version: string;
  ai_config: Record<string, unknown> | null;
  anti_detection: Record<string, unknown> | null;
  validation_config: Record<string, unknown> | null;
  login_config: Record<string, unknown> | null;
  http_status_config: Record<string, unknown> | null;
  normalization_config: Record<string, unknown> | null;
  timeout: number | null;
  retries: number | null;
  image_quality: number | null;
  published_at: string | null;
  published_by: string | null;
}

interface DbSelector {
  id: string;
  version_id: string;
  name: string;
  selector: string;
  attribute: string | null;
  multiple: boolean;
  required: boolean;
  sort_order: number;
}

interface DbWorkflowStep {
  id: string;
  version_id: string;
  action: string;
  name: string | null;
  params: Record<string, unknown>;
  sort_order: number;
}

interface DbTestSku {
  id: string;
  config_id: string;
  sku: string;
  sku_type: string;
}

// ============================================================================
// Assembly Function
// ============================================================================

/**
 * Assembles a complete ScraperConfig payload from normalized database tables.
 * 
 * @param configId - The UUID of the scraper_config
 * @param supabaseClient - Optional Supabase client (creates admin client if not provided)
 * @returns Complete ScraperConfigPayload matching Python model
 */
export async function assembleScraperConfig(
  configId: string,
  supabaseClient?: ReturnType<typeof createClient>
): Promise<ScraperConfigPayload | null> {
  
  const getAdminClient = () => {
    if (supabaseClient) return supabaseClient;
    
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
  };

  const supabase = getAdminClient();

  // 1. Fetch scraper config
  const { data: config, error: configError } = await supabase
    .from('scraper_configs')
    .select('*')
    .eq('id', configId)
    .single();

  if (configError || !config) {
    console.error('Error fetching scraper config:', configError);
    return null;
  }

  const dbConfig = config as unknown as DbScraperConfig;

  // 2. Fetch current version (published)
  let version: DbScraperConfigVersion | null = null;
  
  if (dbConfig.current_version_id) {
    const { data: versionData, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', dbConfig.current_version_id)
      .single();

    if (!versionError && versionData) {
      version = versionData as unknown as DbScraperConfigVersion;
    }
  }

  // If no current_version_id, try to get the latest published version
  if (!version) {
    const { data: publishedVersion, error: publishedError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('config_id', configId)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (!publishedError && publishedVersion) {
      version = publishedVersion as unknown as DbScraperConfigVersion;
    }
  }

  if (!version) {
    console.error('No published version found for config:', configId);
    return null;
  }

  // 3. Fetch selectors for this version
  const { data: selectorsData } = await supabase
    .from('scraper_selectors')
    .select('*')
    .eq('version_id', version.id)
    .order('sort_order', { ascending: true });

  const dbSelectors = (selectorsData || []) as unknown as DbSelector[];
  const selectors: SelectorConfig[] = dbSelectors.map(s => ({
    name: s.name,
    selector: s.selector,
    attribute: s.attribute,
    multiple: s.multiple,
    required: s.required,
  }));

  // 4. Fetch workflow steps for this version
  const { data: stepsData } = await supabase
    .from('scraper_workflow_steps')
    .select('*')
    .eq('version_id', version.id)
    .order('sort_order', { ascending: true });

  const dbSteps = (stepsData || []) as unknown as DbWorkflowStep[];
  const workflows: WorkflowStep[] = dbSteps.map(s => ({
    action: s.action,
    name: s.name,
    params: s.params || {},
  }));

  // 5. Fetch test SKUs
  const { data: testSkusData } = await supabase
    .from('scraper_config_test_skus')
    .select('sku, sku_type')
    .eq('config_id', configId);

  const dbTestSkus = (testSkusData || []) as unknown as DbTestSku[];
  
  const test_skus = dbTestSkus
    .filter(s => s.sku_type === 'test')
    .map(s => s.sku);
  
  const fake_skus = dbTestSkus
    .filter(s => s.sku_type === 'fake')
    .map(s => s.sku);
  
  const edge_case_skus = dbTestSkus
    .filter(s => s.sku_type === 'edge_case')
    .map(s => s.sku);

  // 6. Assemble the final payload
  const payload: ScraperConfigPayload = {
    schema_version: dbConfig.schema_version || '1.0',
    name: dbConfig.slug,
    display_name: dbConfig.display_name,
    base_url: dbConfig.base_url || '',
    scraper_type: (dbConfig.scraper_type as 'static' | 'agentic') || 'static',
    selectors,
    workflows,
    ai_config: version.ai_config as AIConfig | null,
    anti_detection: version.anti_detection as AntiDetectionConfig | null,
    validation: version.validation_config as ValidationConfig | null,
    login: version.login_config as LoginConfig | null,
    http_status: version.http_status_config as HttpStatusConfig | null,
    normalization: version.normalization_config as NormalizationRule[] | null,
    timeout: version.timeout || 30,
    retries: version.retries || 3,
    image_quality: version.image_quality || 50,
    test_skus,
    fake_skus,
    edge_case_skus,
  };

  return payload;
}

/**
 * Assembles config by slug (convenience function)
 */
export async function assembleScraperConfigBySlug(
  slug: string,
  supabaseClient?: ReturnType<typeof createClient>
): Promise<ScraperConfigPayload | null> {
  
  const getAdminClient = () => {
    if (supabaseClient) return supabaseClient;
    
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
  };

  const supabase = getAdminClient();

  const { data: config, error } = await supabase
    .from('scraper_configs')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !config) {
    console.error('Error finding config by slug:', slug, error);
    return null;
  }

  return assembleScraperConfig(config.id, supabaseClient);
}
