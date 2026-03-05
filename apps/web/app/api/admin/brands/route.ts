import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching brands:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ brands: data || [] });
}
