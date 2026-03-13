import { validateRunnerAuth } from '@/lib/scraper-auth';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import YAML from 'yaml';

type ScraperConfigListItem = {
  slug: string;
  display_name: string;
  domain: string | null;
  version_number: number | null;
  published_at: string | null;
};

type ParsedScraperConfig = {
  name?: unknown;
  display_name?: unknown;
  base_url?: unknown;
};

const CONFIGS_DIR = path.join(process.cwd(), '..', 'scraper', 'scrapers', 'configs');

function getDomain(baseUrl: unknown): string | null {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    return null;
  }

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
}

async function readConfigListItem(fileName: string): Promise<ScraperConfigListItem | null> {
  const slug = path.basename(fileName, '.yaml');

  try {
    const rawYaml = await readFile(path.join(CONFIGS_DIR, fileName), 'utf8');
    const parsed = YAML.parse(rawYaml) as ParsedScraperConfig | null;

    return {
      slug,
      display_name:
        typeof parsed?.display_name === 'string'
          ? parsed.display_name
          : typeof parsed?.name === 'string'
            ? parsed.name
            : slug,
      domain: getDomain(parsed?.base_url),
      version_number: null,
      published_at: null,
    };
  } catch (error) {
    console.warn(`Skipping invalid scraper config YAML: ${fileName}`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const fileNames = (await readdir(CONFIGS_DIR)).filter((fileName) => fileName.endsWith('.yaml'));
    const configs = await Promise.all(fileNames.map((fileName) => readConfigListItem(fileName)));
    const formattedConfigs = configs
      .filter((config): config is ScraperConfigListItem => config !== null)
      .sort((left, right) => left.slug.localeCompare(right.slug));

    return NextResponse.json({
      data: formattedConfigs,
      count: formattedConfigs.length,
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
