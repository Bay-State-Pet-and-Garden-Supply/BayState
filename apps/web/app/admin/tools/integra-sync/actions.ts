'use server';

import {
    parseIntegraExcel,
    analyzeIntegraSync,
    addToOnboarding,
    IntegraProduct
} from '@/lib/admin/integra-sync';
import { revalidatePath } from 'next/cache';

export async function analyzeIntegraAction(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) {
            return { success: false, error: 'No file provided' };
        }

        const buffer = await file.arrayBuffer();
        const products = await parseIntegraExcel(buffer);

        if (products.length === 0) {
            return { success: false, error: 'No valid products found in file. Check column headers (SKU_NO, LIST_PRICE, DESCRIPTION1).' };
        }

        const analysis = await analyzeIntegraSync(products);
        return { success: true, analysis };
    } catch (error) {
        console.error('Integra analysis error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function processOnboardingAction(products: IntegraProduct[]) {
    try {
        const result = await addToOnboarding(products);
        if (result.success) {
            revalidatePath('/admin/pipeline');
            return { success: true, count: result.count };
        } else {
            return { success: false, error: 'Failed to add products to onboarding' };
        }
    } catch (error) {
        console.error('Onboarding processing error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
