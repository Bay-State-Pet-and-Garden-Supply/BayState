import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { ScraperConfig } from './types';

export async function getLocalScraperConfigs(): Promise<ScraperConfig[]> {
  const configsDir = path.join(process.cwd(), '../scraper/scrapers/configs');
  
  if (!fs.existsSync(configsDir)) {
    console.error(`Configs directory not found: ${configsDir}`);
    return [];
  }

  const files = fs.readdirSync(configsDir);
  const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  const configs = yamlFiles.map(filename => {
    try {
      const filePath = path.join(configsDir, filename);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const config = yaml.parse(fileContent);
      const slug = filename.replace(/\.ya?ml$/, '');

      return {
        id: slug, // Use slug as ID for local configs
        slug,
        name: config.name || slug,
        display_name: config.display_name || config.name || slug,
        base_url: config.base_url || '',
        scraper_type: config.scraper_type || 'static',
        status: config.status || 'active',
        domain: config.domain || (config.base_url ? new URL(config.base_url).hostname : null),
        health_status: config.health_status || 'unknown',
        health_score: config.health_score ?? null,
        last_test_at: config.last_test_at || null,
        schema_version: config.schema_version || '1.0',
        file_path: `scrapers/configs/${filename}`
      } as ScraperConfig;
    } catch (err) {
      console.error(`Error parsing yaml file ${filename}:`, err);
      return null;
    }
  }).filter(c => c !== null) as ScraperConfig[];

  return configs;
}

export async function getLocalScraperConfig(slug: string): Promise<{ yaml: string, config: ScraperConfig } | null> {
  const configsDir = path.join(process.cwd(), '../scraper/scrapers/configs');
  const filePath = path.join(configsDir, `${slug}.yaml`);
  const alternateFilePath = path.join(configsDir, `${slug}.yml`);

  let finalPath = '';
  if (fs.existsSync(filePath)) {
    finalPath = filePath;
  } else if (fs.existsSync(alternateFilePath)) {
    finalPath = alternateFilePath;
  }

  if (!finalPath) {
    return null;
  }

  try {
    const yamlContent = fs.readFileSync(finalPath, 'utf8');
    const config = yaml.parse(yamlContent);

    return {
      yaml: yamlContent,
      config: {
        id: slug,
        slug,
        name: config.name || slug,
        display_name: config.display_name || config.name || slug,
        base_url: config.base_url || '',
        scraper_type: config.scraper_type || 'static',
        status: config.status || 'active',
        domain: config.domain || (config.base_url ? new URL(config.base_url).hostname : null),
        health_status: config.health_status || 'unknown',
        health_score: config.health_score ?? null,
        last_test_at: config.last_test_at || null,
        schema_version: config.schema_version || '1.0',
        file_path: `scrapers/configs/${path.basename(finalPath)}`,
        ...config
      } as ScraperConfig
    };
  } catch (err) {
    console.error(`Error reading/parsing yaml file for ${slug}:`, err);
    return null;
  }
}
