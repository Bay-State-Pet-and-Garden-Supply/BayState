import { validateActiveRunner } from '@/lib/scraper-auth';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import YAML from 'yaml';

const CONFIGS_DIR = path.join(process.cwd(), '..', 'scraper', 'scrapers', 'configs');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const activeRunner = await validateActiveRunner(request);

    if (!activeRunner.isAuthenticated) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    if (!activeRunner.isEnabled) {
      if (activeRunner.mismatchResponse) {
        return activeRunner.mismatchResponse;
      }
      return NextResponse.json({ error: 'Forbidden: Runner is disabled' }, { status: 403 });
    }

    const filePath = path.join(CONFIGS_DIR, `${slug}.yaml`);
    let config: Record<string, unknown>;

    try {
      const rawYaml = await readFile(filePath, 'utf8');
      const parsed = YAML.parse(rawYaml);

      config = typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
    } catch (error) {
      const isMissingFile =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

      if (isMissingFile) {
        return NextResponse.json(
          { error: 'Scraper config not found or has no published version' },
          { status: 404 }
        );
      }

      throw error;
    }

    if (Object.keys(config).length === 0) {
      return NextResponse.json(
        { error: 'Scraper config not found or has no published version' },
        { status: 404 }
      );
    }

    if (typeof config.slug !== 'string' || config.slug.length === 0) {
      config.slug = slug;
    }

    return NextResponse.json(config, {
      headers: {
        'X-Config-Source': 'yaml',
      },
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
