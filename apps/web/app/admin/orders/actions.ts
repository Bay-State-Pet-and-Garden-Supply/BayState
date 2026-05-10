'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ActionState } from '@/lib/types';

import {
  cancelOrderAction as cancelOrderImpl,
  archiveOrderAction as archiveOrderImpl,
  voidOrderAction as voidOrderImpl,
  updateOrderPaymentStatusAction as updatePaymentImpl,
  updateOrderFulfillmentStatusAction as updateFulfillmentImpl,
} from '@/lib/admin/orders/mutations';

export {
  cancelOrderImpl as cancelOrderAction,
  archiveOrderImpl as archiveOrderAction,
  voidOrderImpl as voidOrderAction,
  updatePaymentImpl as updateOrderPaymentStatusAction,
  updateFulfillmentImpl as updateOrderFulfillmentStatusAction,
};

export async function updateOrderStatusAction(
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
): Promise<ActionState> {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from('orders')
    .select('status')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('orders')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Update order status error:', error);
    return { success: false, error: 'Failed to update order status' };
  }

  const { error: eventError } = await supabase.from('order_events').insert({
    order_id: id,
    event_type: 'status_changed',
    previous_value: { status: current?.status },
    new_value: { status },
  });

  if (eventError) {
    console.error('Failed to write order event:', eventError.message);
  }

  revalidatePath('/admin/orders');
  return { success: true };
}
