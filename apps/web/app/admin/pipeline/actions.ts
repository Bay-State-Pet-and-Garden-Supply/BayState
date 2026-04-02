'use server';

import { addToOnboarding, IntegraProduct } from '@/lib/admin/integra-sync';
import { revalidatePath } from 'next/cache';

/**
 * Server action to manually add a single product to the ingestion pipeline (Imported tab).
 */
export async function manualAddProductAction(product: IntegraProduct) {
    try {
        if (!product.sku || !product.name) {
            return { success: false, error: 'SKU and Name are required' };
        }

        const result = await addToOnboarding([product]);
        
        if (result.success) {
            revalidatePath('/admin/pipeline');
            return { success: true, count: result.count };
        } else {
            return { success: false, error: 'Failed to add product to pipeline' };
        }
    } catch (error) {
        console.error('Manual product add error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
