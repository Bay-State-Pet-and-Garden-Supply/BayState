import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const brandId = searchParams.get('brand_id') || '';
  const status = searchParams.get('status') || 'all'; // 'all', 'ungrouped', 'in_group', 'in_current_group'
  const groupId = searchParams.get('group_id') || '';
  
  const supabase = await createAdminClient();

  try {
    // 1. Get all product group assignments so we can map products to their groups
    const { data: assignments, error: assignError } = await supabase
      .from('product_group_products')
      .select('product_id, group_id, is_default, sort_order, product_groups(name)');

    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    const assignmentMap = new Map<string, { group_id: string; is_default: boolean; sort_order: number; group_name: string }>();
    for (const assoc of assignments || []) {
      const groupData = assoc.product_groups as unknown as { name: string } | { name: string }[] | null;
      const gName = groupData
        ? Array.isArray(groupData)
          ? groupData[0]?.name
          : groupData.name
        : 'Unknown Group';

      assignmentMap.set(assoc.product_id, {
        group_id: assoc.group_id,
        is_default: assoc.is_default,
        sort_order: assoc.sort_order || 0,
        group_name: gName || 'Unknown Group',
      });
    }

    // 2. Fetch products
    let query = supabase
      .from('products')
      .select('id, name, slug, price, images, stock_status, brand_id, brand:brands(id, name)');

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (brandId) {
      query = query.eq('brand_id', brandId);
    }

    const { data: products, error: prodError } = await query.order('name').limit(100);

    if (prodError) {
      return NextResponse.json({ error: prodError.message }, { status: 500 });
    }

    // 3. Filter and map
    let result = (products || []).map((p) => {
      const assignment = assignmentMap.get(p.id);
      const brandData = p.brand as unknown as { id: string; name: string } | { id: string; name: string }[] | null;
      const brand = brandData ? (Array.isArray(brandData) ? brandData[0] : brandData) : null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        images: p.images,
        stock_status: p.stock_status,
        brand,
        group: assignment || null,
        sort_order: assignment?.sort_order || 0,
      };
    });

    if (status === 'ungrouped') {
      result = result.filter((p) => !p.group);
    } else if (status === 'in_group') {
      result = result.filter((p) => p.group);
    } else if (status === 'in_current_group') {
      result = result
        .filter((p) => p.group?.group_id === groupId)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    return NextResponse.json({ products: result });
  } catch (error) {
    console.error('Failed to search products:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  try {
    const body = await request.json();
    const { action, groupId, productId, productIds } = body;

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID is required' }, { status: 400 });
    }

    if (action === 'add' || action === 'transfer') {
      if (!productId) return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
      
      // If transferring, delete existing group association first
      if (action === 'transfer') {
        await supabase.from('product_group_products').delete().eq('product_id', productId);
      }

      // Check if group is empty to set the first added as default
      const { count } = await supabase
        .from('product_group_products')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      const isDefault = count === 0;

      const { error } = await supabase
        .from('product_group_products')
        .insert({
          group_id: groupId,
          product_id: productId,
          is_default: isDefault,
          sort_order: 0,
        });

      if (error) throw error;

      if (isDefault) {
        // Update group default_product_id
        await supabase.from('product_groups').update({ default_product_id: productId }).eq('id', groupId);
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'remove') {
      if (!productId) return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });

      // First check if it was default
      const { data: member } = await supabase
        .from('product_group_products')
        .select('is_default')
        .eq('group_id', groupId)
        .eq('product_id', productId)
        .single();

      const { error } = await supabase
        .from('product_group_products')
        .delete()
        .eq('group_id', groupId)
        .eq('product_id', productId);

      if (error) throw error;

      // If it was default, assign default to another member
      if (member?.is_default) {
        const { data: nextMember } = await supabase
          .from('product_group_products')
          .select('product_id')
          .eq('group_id', groupId)
          .limit(1);

        if (nextMember && nextMember.length > 0) {
          const nextId = nextMember[0].product_id;
          await supabase.from('product_group_products').update({ is_default: true }).eq('group_id', groupId).eq('product_id', nextId);
          await supabase.from('product_groups').update({ default_product_id: nextId }).eq('id', groupId);
        } else {
          await supabase.from('product_groups').update({ default_product_id: null }).eq('id', groupId);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'bulk_add' || action === 'bulk_transfer') {
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return NextResponse.json({ error: 'Product IDs array is required' }, { status: 400 });
      }

      if (action === 'bulk_transfer') {
        // Delete existing associations
        await supabase.from('product_group_products').delete().in('product_id', productIds);
      }

      // Check if group is empty
      const { count } = await supabase
        .from('product_group_products')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      const groupIsEmpty = count === 0;

      const inserts = productIds.map((pId, idx) => {
        const isDefault = groupIsEmpty && idx === 0;
        return {
          group_id: groupId,
          product_id: pId,
          is_default: isDefault,
          sort_order: idx * 10,
        };
      });

      const { error } = await supabase.from('product_group_products').insert(inserts);
      if (error) throw error;

      if (groupIsEmpty) {
        await supabase.from('product_groups').update({ default_product_id: productIds[0] }).eq('id', groupId);
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'bulk_remove') {
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return NextResponse.json({ error: 'Product IDs array is required' }, { status: 400 });
      }

      // Check if any of these was the default
      const { data: defaultMember } = await supabase
        .from('product_group_products')
        .select('product_id')
        .eq('group_id', groupId)
        .eq('is_default', true)
        .single();

      const defaultRemoved = defaultMember && productIds.includes(defaultMember.product_id);

      const { error } = await supabase
        .from('product_group_products')
        .delete()
        .eq('group_id', groupId)
        .in('product_id', productIds);

      if (error) throw error;

      if (defaultRemoved) {
        const { data: nextMember } = await supabase
          .from('product_group_products')
          .select('product_id')
          .eq('group_id', groupId)
          .limit(1);

        if (nextMember && nextMember.length > 0) {
          const nextId = nextMember[0].product_id;
          await supabase.from('product_group_products').update({ is_default: true }).eq('group_id', groupId).eq('product_id', nextId);
          await supabase.from('product_groups').update({ default_product_id: nextId }).eq('id', groupId);
        } else {
          await supabase.from('product_groups').update({ default_product_id: null }).eq('id', groupId);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'reorder') {
      const { orders } = body;
      if (!orders || !Array.isArray(orders)) {
        return NextResponse.json({ error: 'Orders array is required' }, { status: 400 });
      }

      for (const item of orders) {
        await supabase
          .from('product_group_products')
          .update({ sort_order: item.sortOrder })
          .eq('group_id', groupId)
          .eq('product_id', item.productId);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Failed to perform product group action:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
