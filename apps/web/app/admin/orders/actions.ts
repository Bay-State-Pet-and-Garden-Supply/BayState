'use server';

import { revalidatePath } from 'next/cache';
import { updateOrderStatus } from '@/lib/orders';
import { createClient } from '@/lib/supabase/server';

export type ActionState = {
    success: boolean;
    error?: string;
};

export async function updateOrderStatusAction(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'cancelled'
): Promise<ActionState> {
    try {
        const success = await updateOrderStatus(id, status);

        if (!success) {
            return { success: false, error: 'Failed to update order status' };
        }

        revalidatePath('/admin/orders');
        return { success: true };
    } catch (error) {
        console.error('Update order status error:', error);
        return { success: false, error: 'Failed to update order status' };
    }
}

export async function deleteOrder(id: string): Promise<ActionState> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Delete order error:', error);
        return { success: false, error: 'Failed to delete order' };
    }

    revalidatePath('/admin/orders');
    return { success: true };
}
