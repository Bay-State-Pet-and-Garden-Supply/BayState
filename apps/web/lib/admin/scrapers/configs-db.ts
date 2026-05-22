import { createAdminClient } from '@/lib/supabase/server';
import type { ScraperConfig } from './types';

export async function getDatabaseScraperConfigs(): Promise<ScraperConfig[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('scraper_configs')
    .select(`
      id, slug, display_name, domain, base_url, scraper_type, status,
      health_status, health_score, last_test_at, schema_version,
      scraper_config_versions!fk_current_version (
        selectors,
        workflows,
        normalization,
        login_config,
        timeout,
        retries,
        image_quality,
        anti_detection,
        http_status,
        validation,
        test_upcs,
        fake_upcs,
        edge_case_upcs,
        test_assertions,
        ai_config,
        credential_refs,
        status
      )
    `)
    .in('status', ['active', 'draft']);

  if (error || !data) {
    console.error('[Scraper Configs DB] Failed to fetch configs:', error);
    return [];
  }

  return data.map((row: any) => {
    const version = Array.isArray(row.scraper_config_versions) 
        ? row.scraper_config_versions[0] 
        : row.scraper_config_versions || {};
        
    return {
      id: row.slug || row.id,
      slug: row.slug,
      name: row.display_name || row.slug,
      display_name: row.display_name,
      domain: row.domain,
      base_url: row.base_url || '',
      scraper_type: row.scraper_type || 'static',
      status: version.status === 'published' ? 'active' : (row.status || 'active'),
      health_status: row.health_status,
      health_score: row.health_score,
      last_test_at: row.last_test_at,
      schema_version: row.schema_version || '1.0',
      selectors: version.selectors,
      workflows: version.workflows,
      normalization: version.normalization,
      login: version.login_config,
      timeout: version.timeout,
      retries: version.retries,
      image_quality: version.image_quality,
      anti_detection: version.anti_detection,
      http_status: version.http_status,
      validation: version.validation,
      test_upcs: version.test_upcs,
      fake_upcs: version.fake_upcs,
      edge_case_upcs: version.edge_case_upcs,
      test_assertions: version.test_assertions,
      ai_config: version.ai_config,
      credential_refs: version.credential_refs,
    } as ScraperConfig;
  });
}

export async function getDatabaseScraperConfig(slug: string): Promise<{ config: ScraperConfig } | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('scraper_configs')
    .select(`
      id, slug, display_name, domain, base_url, scraper_type, status,
      health_status, health_score, last_test_at, schema_version,
      scraper_config_versions!fk_current_version (
        selectors,
        workflows,
        normalization,
        login_config,
        timeout,
        retries,
        image_quality,
        anti_detection,
        http_status,
        validation,
        test_upcs,
        fake_upcs,
        edge_case_upcs,
        test_assertions,
        ai_config,
        credential_refs,
        status
      )
    `)
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .single();

  if (error || !data) {
    return null;
  }

  const row = data as any;
  const version = Array.isArray(row.scraper_config_versions) 
      ? row.scraper_config_versions[0] 
      : row.scraper_config_versions || {};

  const config = {
    id: row.slug || row.id,
    slug: row.slug,
    name: row.display_name || row.slug,
    display_name: row.display_name,
    domain: row.domain,
    base_url: row.base_url || '',
    scraper_type: row.scraper_type || 'static',
    status: version.status === 'published' ? 'active' : (row.status || 'active'),
    health_status: row.health_status,
    health_score: row.health_score,
    last_test_at: row.last_test_at,
    schema_version: row.schema_version || '1.0',
    selectors: version.selectors,
    workflows: version.workflows,
    normalization: version.normalization,
    login: version.login_config,
    timeout: version.timeout,
    retries: version.retries,
    image_quality: version.image_quality,
    anti_detection: version.anti_detection,
    http_status: version.http_status,
    validation: version.validation,
    test_upcs: version.test_upcs,
    fake_upcs: version.fake_upcs,
    edge_case_upcs: version.edge_case_upcs,
    test_assertions: version.test_assertions,
    ai_config: version.ai_config,
    credential_refs: version.credential_refs,
  } as ScraperConfig;

  return { config };
}
