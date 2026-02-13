import { createAdminClient } from '@/lib/supabase/server';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createConfigSchema = z.object({
  slug: z.string().min(1, 'Slug is required').max(255).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  display_name: z.string().min(1).max(255).optional(),
  domain: z.string().max(512).optional(),
  config: scraperConfigSchema,
  change_summary: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient();
    // const { data: { user } } = await supabase.auth.getUser();

    const user = { id: '00000000-0000-0000-0000-000000000000' };

    const json = await request.json();
    const validatedData = createConfigSchema.parse(json);

    const client = await createAdminClient();

    const { data: config, error: configError } = await client
      .from('scraper_configs')
      .insert({
        slug: validatedData.slug,
        display_name: validatedData.display_name ?? null,
        domain: validatedData.domain ?? null,
        schema_version: validatedData.config.schema_version,
        created_by: user.id,
      })
      .select()
      .single();

    if (configError) {
      if (configError.code === '23505') {
        return NextResponse.json({ error: 'A config with this slug already exists' }, { status: 409 });
      }
      console.error('Database error creating config:', configError);
      return NextResponse.json({ error: 'Failed to create config' }, { status: 500 });
    }

    const { data: version, error: versionError } = await client
      .from('scraper_config_versions')
      .insert({
        config_id: config.id,
        schema_version: validatedData.config.schema_version,
        config: validatedData.config,
        status: 'draft',
        version_number: 1,
        change_summary: validatedData.change_summary ?? 'Initial draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (versionError) {
      console.error('Database error creating version:', versionError);
      await client.from('scraper_configs').delete().eq('id', config.id);
      return NextResponse.json({ error: 'Failed to create initial version' }, { status: 500 });
    }

    const { error: updateError } = await client
      .from('scraper_configs')
      .update({ current_version_id: version.id })
      .eq('id', config.id);

    if (updateError) {
      console.error('Database error updating config:', updateError);
    }

    const fullConfig = await client
      .from('scraper_configs')
      .select('*, scraper_config_versions(*)')
      .eq('id', config.id)
      .single();

    return NextResponse.json(fullConfig, { status: 201 });
  } catch (error) {
    console.error('Request error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAdminClient();
    // const { data: { user } } = await supabase.auth.getUser();

    // if (!user) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const slug = searchParams.get('slug');
    const include_test_skus = searchParams.get('include_test_skus') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = await createAdminClient();

    // If include_test_skus, fetch the full config including test_skus
    if (include_test_skus) {
      let query = client
        .from('scraper_configs')
        .select(`
          id,
          slug,
          display_name,
          domain,
          current_version_id,
          schema_version,
          created_at,
          updated_at,
          created_by,
          scraper_config_versions!fk_current_version (
            id,
            version_number,
            status,
            published_at,
            config
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) {
        query = query.eq('scraper_config_versions.status', status);
      }

      if (slug) {
        query = query.ilike('slug', `%${slug}%`);
      }

      const { data: configs, error } = await query;

      if (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
      }

      const formattedConfigs = (configs || []).map((config: Record<string, unknown>) => ({
        id: config.id,
        slug: config.slug,
        display_name: config.display_name,
        domain: config.domain,
        current_version_id: config.current_version_id,
        schema_version: config.schema_version,
        created_at: config.created_at,
        updated_at: config.updated_at,
        created_by: config.created_by,
        status: (config.scraper_config_versions as Record<string, unknown>)?.status || null,
        version_number: (config.scraper_config_versions as Record<string, unknown>)?.version_number || null,
        published_at: (config.scraper_config_versions as Record<string, unknown>)?.published_at || null,
        test_skus: ((config.scraper_config_versions as Record<string, unknown>)?.config as Record<string, unknown>)?.test_skus || [],
        fake_skus: ((config.scraper_config_versions as Record<string, unknown>)?.config as Record<string, unknown>)?.fake_skus || [],
      }));

      return NextResponse.json({ data: formattedConfigs });
    }

    let query = client
      .from('scraper_configs')
      .select(`
        id,
        slug,
        display_name,
        domain,
        current_version_id,
        schema_version,
        created_at,
        updated_at,
        created_by,
        scraper_config_versions!fk_current_version (
          id,
          version_number,
          status,
          published_at
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('scraper_config_versions.status', status);
    }

    if (slug) {
      query = query.ilike('slug', `%${slug}%`);
    }

    const { data: configs, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    const { count } = await client
      .from('scraper_configs')
      .select('*', { count: 'exact', head: true });

    const formattedConfigs = (configs || []).map((config: Record<string, unknown>) => ({
      id: config.id,
      slug: config.slug,
      display_name: config.display_name,
      domain: config.domain,
      current_version_id: config.current_version_id,
      schema_version: config.schema_version,
      created_at: config.created_at,
      updated_at: config.updated_at,
      created_by: config.created_by,
      status: (config.scraper_config_versions as Record<string, unknown>)?.status || null,
      version_number: (config.scraper_config_versions as Record<string, unknown>)?.version_number || null,
      published_at: (config.scraper_config_versions as Record<string, unknown>)?.published_at || null,
    }));

    return NextResponse.json({
      data: formattedConfigs,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (configs?.length || 0) === limit,
      },
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
