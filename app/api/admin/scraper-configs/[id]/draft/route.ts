import { createClient } from '@/lib/supabase/server';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateDraftSchema = z.object({
  config: scraperConfigSchema.optional(),
  change_summary: z.string().optional(),
});

export async function PUT(
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

    const json = await request.json();
    const validatedData = updateDraftSchema.parse(json);

    if (!validatedData.config && !validatedData.change_summary) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
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
      return NextResponse.json({ error: 'No draft version found' }, { status: 404 });
    }

    const { data: currentVersion, error: versionError } = await client
      .from('scraper_config_versions')
      .select('*')
      .eq('id', currentConfig.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return NextResponse.json({ error: 'Draft version not found' }, { status: 404 });
    }

    if (currentVersion.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Current version is not a draft. Create a new draft first.' 
      }, { status: 409 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (validatedData.config) {
      updates.config = validatedData.config;
      updates.schema_version = validatedData.config.schema_version;
      updates.validation_result = null;
    }

    if (validatedData.change_summary) {
      updates.change_summary = validatedData.change_summary;
    }

    const { data: updatedVersion, error: updateError } = await client
      .from('scraper_config_versions')
      .update(updates)
      .eq('id', currentConfig.current_version_id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error updating draft:', updateError);
      return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 });
    }

    return NextResponse.json(updatedVersion);
  } catch (error) {
    console.error('Request error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
