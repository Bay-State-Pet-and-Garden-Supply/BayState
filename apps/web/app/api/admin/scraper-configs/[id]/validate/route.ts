import { createClient } from '@/lib/supabase/server';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { NextRequest, NextResponse } from 'next/server';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  validated_at: string;
  validated_by: string;
}

function validateConfig(config: Record<string, unknown>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    scraperConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
      for (const issue of zodError.issues) {
        const path = issue.path.join('.');
        errors.push(`${path}: ${issue.message}`);
      }
    }
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.base_url && typeof cfg.base_url === 'string') {
    if (!cfg.base_url.startsWith('https://')) {
      warnings.push('base_url should use HTTPS for production');
    }
  }

  if (cfg.timeout && typeof cfg.timeout === 'number') {
    if (cfg.timeout > 60) {
      warnings.push('timeout > 60 seconds may impact performance');
    }
  }

  if (cfg.retries && typeof cfg.retries === 'number') {
    if (cfg.retries > 5) {
      warnings.push('retries > 5 may increase runtime significantly');
    }
  }

  const skus = ['test_skus', 'fake_skus', 'edge_case_skus'] as const;
  for (const skuField of skus) {
    const skusValue = cfg[skuField];
    if (Array.isArray(skusValue) && skusValue.length > 50) {
      warnings.push(`${skuField} has ${skusValue.length} items (recommended: < 50)`);
    }
  }

  return { errors, warnings };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await createClient();

    const { data: currentConfig, error: fetchError } = await client
      .from('scraper_configs')
      .select('current_version_id')
      .eq('id', id)
      .single();

    if (fetchError || !currentConfig) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    if (!currentConfig.current_version_id) {
      return NextResponse.json({ error: 'No version found' }, { status: 404 });
    }

    const { data: currentVersion, error: versionError } = await client
      .from('scraper_config_versions')
      .select('*')
      .eq('id', currentConfig.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    if (currentVersion.status === 'published') {
      return NextResponse.json({ error: 'Cannot validate a published version. Create a new draft first.' }, { status: 409 });
    }

    const config = currentVersion.config as Record<string, unknown>;
    const { errors, warnings } = validateConfig(config);

    const validationResult: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      validated_at: new Date().toISOString(),
      validated_by: user.id,
    };

    const newStatus = errors.length === 0 ? 'validated' : 'draft';

    const { data: updatedVersion, error: updateError } = await client
      .from('scraper_config_versions')
      .update({
        status: newStatus,
        validation_result: validationResult,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentConfig.current_version_id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error validating draft:', updateError);
      return NextResponse.json({ error: 'Failed to validate draft' }, { status: 500 });
    }

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
