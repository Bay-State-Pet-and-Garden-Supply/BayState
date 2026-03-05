import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase
    .from('brands')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting brand:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Brand not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ brand: data });
}
