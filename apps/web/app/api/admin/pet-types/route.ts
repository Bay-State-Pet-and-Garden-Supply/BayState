import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('pet_types')
    .select('id, name')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching pet types:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ petTypes: data || [] });
}
