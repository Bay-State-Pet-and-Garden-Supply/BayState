import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SETTINGS_KEY = 'shopsite_migration';

interface ShopSiteSettingsValue {
  storeUrl: string;
  merchantId: string;
  password: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase };
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const { data } = await auth.supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    const value = (data?.value ?? {}) as Partial<ShopSiteSettingsValue>;

    return NextResponse.json({
      storeUrl: value.storeUrl ?? '',
      merchantId: value.merchantId ?? '',
      passwordConfigured: Boolean(value.password),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch ShopSite settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const body = (await request.json()) as {
      storeUrl?: string;
      merchantId?: string;
      password?: string;
    };

    const storeUrl = body.storeUrl?.trim() ?? '';
    const merchantId = body.merchantId?.trim() ?? '';
    const nextPassword = body.password?.trim() ?? '';

    if (!storeUrl || !merchantId) {
      return NextResponse.json(
        { error: 'Store URL and Merchant ID are required' },
        { status: 400 },
      );
    }

    const { data: existingRow } = await auth.supabase
      .from('site_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    const existing = (existingRow?.value ?? {}) as Partial<ShopSiteSettingsValue>;
    const password = nextPassword || existing.password || '';

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required the first time ShopSite settings are saved' },
        { status: 400 },
      );
    }

    const value: ShopSiteSettingsValue = {
      storeUrl,
      merchantId,
      password,
    };

    const { error } = await auth.supabase
      .from('site_settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save ShopSite settings', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      storeUrl,
      merchantId,
      passwordConfigured: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save ShopSite settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
