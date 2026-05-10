import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ActionState } from '@/lib/types';
import type { OrderFulfillmentStatus, OrderPaymentStatusEnum } from '@/lib/orders';

export async function cancelOrderAction(
  orderId: string,
  reason?: string
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('status, fulfillment_status')
    .eq('id', orderId)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      fulfillment_status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Cancel order error:', error);
    return { success: false, error: 'Failed to cancel order' };
  }

  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'order_cancelled',
    previous_value: { status: current?.status, fulfillment_status: current?.fulfillment_status },
    new_value: { status: 'cancelled', fulfillment_status: 'cancelled' },
    note: reason ?? null,
  });

  revalidatePath('/admin/orders');
  return { success: true };
}

export async function archiveOrderAction(orderId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Archive order error:', error);
    return { success: false, error: 'Failed to archive order' };
  }

  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'order_archived',
    previous_value: { status: current?.status },
    new_value: { status: 'completed' },
  });

  revalidatePath('/admin/orders');
  return { success: true };
}

export async function voidOrderAction(orderId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('payment_status')
    .eq('id', orderId)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'voided' as OrderPaymentStatusEnum,
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Void order error:', error);
    return { success: false, error: 'Failed to void order' };
  }

  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'payment_voided',
    previous_value: { payment_status: current?.payment_status },
    new_value: { payment_status: 'voided' },
  });

  revalidatePath('/admin/orders');
  return { success: true };
}

export async function updateOrderPaymentStatusAction(
  orderId: string,
  paymentStatus: OrderPaymentStatusEnum
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('payment_status')
    .eq('id', orderId)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Update payment status error:', error);
    return { success: false, error: 'Failed to update payment status' };
  }

  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'payment_status_changed',
    previous_value: { payment_status: current?.payment_status },
    new_value: { payment_status: paymentStatus },
  });

  revalidatePath('/admin/orders');
  return { success: true };
}

export async function updateOrderFulfillmentStatusAction(
  orderId: string,
  fulfillmentStatus: OrderFulfillmentStatus
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('fulfillment_status')
    .eq('id', orderId)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      fulfillment_status: fulfillmentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Update fulfillment status error:', error);
    return { success: false, error: 'Failed to update fulfillment status' };
  }

  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: 'fulfillment_status_changed',
    previous_value: { fulfillment_status: current?.fulfillment_status },
    new_value: { fulfillment_status: fulfillmentStatus },
  });

  revalidatePath('/admin/orders');
  return { success: true };
}
