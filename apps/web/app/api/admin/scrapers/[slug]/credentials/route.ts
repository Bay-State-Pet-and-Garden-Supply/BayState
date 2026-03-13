import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getScraperCredentialStatuses,
  setScraperCredential,
  deleteScraperCredential,
  ScraperCredentialType
} from '@/lib/admin/scrapers/credentials';

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

  if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { userId: user.id };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const { slug } = await params;
    const statuses = await getScraperCredentialStatuses(slug);

    return NextResponse.json({ statuses });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch scraper credentials',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const { slug } = await params;
    const body = (await request.json()) as {
      type: ScraperCredentialType;
      value: string;
    };

    if (!body.type || !body.value) {
      return NextResponse.json({ error: 'Type and value are required' }, { status: 400 });
    }

    await setScraperCredential(slug, body.type, body.value, auth.userId);

    const statuses = await getScraperCredentialStatuses(slug);

    return NextResponse.json({ success: true, statuses });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update scraper credential',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth) {
      return auth.error;
    }

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as ScraperCredentialType;

    if (!type) {
      return NextResponse.json({ error: 'Type is required' }, { status: 400 });
    }

    await deleteScraperCredential(slug, type);

    const statuses = await getScraperCredentialStatuses(slug);

    return NextResponse.json({ success: true, statuses });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to delete scraper credential',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
