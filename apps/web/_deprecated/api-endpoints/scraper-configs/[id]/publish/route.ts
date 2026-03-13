import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const publishSchema = z.object({
  change_summary: z.string().optional(),
});

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

    const json = await request.json();
    const { change_summary } = publishSchema.parse(json);

    const client = await createClient();

    const { data: profile } = await client
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isStaff = profile?.role === 'admin' || profile?.role === 'staff';
    if (!isStaff) {
      return NextResponse.json({ error: 'Forbidden: staff role required' }, { status: 403 });
    }

    const { data: config, error: configError } = await client
      .from('scraper_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    if (!config.current_version_id) {
      return NextResponse.json({ error: 'No version found to publish' }, { status: 404 });
    }

    const { data: currentVersion, error: versionError } = await client
      .from('scraper_config_versions')
      .select('*')
      .eq('id', config.current_version_id)
      .single();

    if (versionError || !currentVersion) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    if (currentVersion.status !== 'validated') {
      return NextResponse.json(
        { error: 'Version must be validated before publishing' },
        { status: 400 }
      );
    }

    const { data: latestPublished } = await client
      .from('scraper_config_versions')
      .select('id')
      .eq('config_id', id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (currentVersion.version_number || 1) + 1
      : 1;

    const { data: newVersion, error: createError } = await client
      .from('scraper_config_versions')
      .insert({
        config_id: id,
        schema_version: currentVersion.schema_version,
        config: currentVersion.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: change_summary || `Published version ${newVersionNumber}`,
        validation_result: currentVersion.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error creating published version:', createError);
      return NextResponse.json({ error: 'Failed to publish config' }, { status: 500 });
    }

    const { error: updateConfigError } = await client
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: currentVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateConfigError) {
      console.error('Database error updating config:', updateConfigError);
    }

    let previousVersionArchived = false;
    if (latestPublished) {
      const { error: archiveError } = await client
        .from('scraper_config_versions')
        .update({ status: 'archived' })
        .eq('id', latestPublished.id);

      if (archiveError) {
        console.error('Failed to archive previous version:', archiveError);
      } else {
        previousVersionArchived = true;
      }
    }

    return NextResponse.json({
      ...newVersion,
      previous_version_archived: previousVersionArchived,
    }, { status: 201 });
  } catch (error) {
    console.error('Request error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
