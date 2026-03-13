import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const rollbackSchema = z.object({
  target_version_id: z.string().uuid(),
  reason: z.string().min(1, 'Rollback reason is required'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const json = await request.json();
    const { target_version_id, reason } = rollbackSchema.parse(json);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isStaff = profile?.role === 'admin' || profile?.role === 'staff';
    if (!isStaff) {
      return NextResponse.json({ error: 'Forbidden: staff role required' }, { status: 403 });
    }

    const { data: config, error: configError } = await supabase
      .from('scraper_configs')
      .select('*')
      .eq('id', id)
      .single();

    if (configError || !config) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const { data: targetVersion, error: versionError } = await supabase
      .from('scraper_config_versions')
      .select('*')
      .eq('id', target_version_id)
      .eq('config_id', id)
      .single();

    if (versionError || !targetVersion) {
      return NextResponse.json({ error: 'Target version not found' }, { status: 404 });
    }

    if (targetVersion.status === 'published') {
      return NextResponse.json(
        { error: 'Cannot rollback to a version that is already published' },
        { status: 400 }
      );
    }

    const { data: latestPublished } = await supabase
      .from('scraper_config_versions')
      .select('id, version_number')
      .eq('config_id', id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = latestPublished
      ? (latestPublished.version_number || 1) + 1
      : 1;

    const { data: newVersion, error: createError } = await supabase
      .from('scraper_config_versions')
      .insert({
        config_id: id,
        schema_version: targetVersion.schema_version,
        config: targetVersion.config,
        status: 'published',
        version_number: newVersionNumber,
        published_at: new Date().toISOString(),
        published_by: user.id,
        change_summary: `Rollback to v${targetVersion.version_number}: ${reason}`,
        validation_result: targetVersion.validation_result,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error creating rollback version:', createError);
      return NextResponse.json({ error: 'Failed to rollback config' }, { status: 500 });
    }

    await supabase
      .from('scraper_configs')
      .update({
        current_version_id: newVersion.id,
        schema_version: targetVersion.schema_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    let previousVersionArchived = false;
    if (latestPublished) {
      const { error: archiveError } = await supabase
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
      id: newVersion.id,
      config_id: id,
      version_number: newVersion.version_number,
      status: 'published',
      config: newVersion.config,
      published_at: newVersion.published_at,
      published_by: newVersion.published_by,
      change_summary: newVersion.change_summary,
      rollback_from_version: targetVersion.version_number,
      reason,
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
