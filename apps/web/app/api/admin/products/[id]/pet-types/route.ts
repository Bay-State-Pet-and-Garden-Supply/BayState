import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id: productId } = await context.params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_pet_types')
    .select('pet_type_id, confidence')
    .eq('product_id', productId);

  if (error) {
    console.error('Error fetching product pet types:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ petTypes: data || [] });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id: productId } = await context.params;
  const supabase = await createClient();

  const body = await request.json();
  const petTypes: { pet_type_id: string; confidence: string }[] = body.petTypes || [];

  const { error: deleteError } = await supabase
    .from('product_pet_types')
    .delete()
    .eq('product_id', productId);

  if (deleteError) {
    console.error('Error deleting product pet types:', deleteError);
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  if (petTypes.length > 0) {
    const insertData = petTypes.map((pt) => ({
      product_id: productId,
      pet_type_id: pt.pet_type_id,
      confidence: pt.confidence || 'manual',
    }));

    const { error: insertError } = await supabase
      .from('product_pet_types')
      .insert(insertData);

    if (insertError) {
      console.error('Error inserting product pet types:', insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
