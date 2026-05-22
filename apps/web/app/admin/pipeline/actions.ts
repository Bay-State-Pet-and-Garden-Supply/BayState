'use server';

import { 
    addToOnboarding, 
    IntegraProduct, 
    runIntegraReconciliation, 
    pushRegisterOnlyIssuesToPipeline 
} from '@/lib/admin/integra-sync';
import { revalidatePath } from 'next/cache';
import { ActionState } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Server action to manually add a single product to the ingestion pipeline (Imported tab).
 */
export async function manualAddProductAction(product: IntegraProduct) {
    try {
        if (!product.upc || !product.name) {
            return { success: false, error: 'UPC and Name are required' };
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

/**
 * Analyzes an Integra Excel export and identifies reconciliation issues.
 */
export async function analyzeIntegraAction(formData: FormData): Promise<ActionState & {
    syncRunId?: string;
    summary?: {
        totalInFile: number;
        matchedProducts: number;
        unchangedProducts: number;
        registerOnlyCount: number;
        websiteOnlyCount: number;
        priceMismatchCount: number;
        quantityMismatchCount: number;
        stockStatusMismatchCount: number;
        totalIssues: number;
    };
}> {
    try {
        const file = formData.get('file') as File;
        if (!file) {
            return { success: false, error: 'No file uploaded' };
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const buffer = await file.arrayBuffer();
        const result = await runIntegraReconciliation({
            buffer,
            fileName: file.name,
            createdBy: user?.id || null,
        });

        // Revalidate the pipeline page since results might show up there
        revalidatePath('/admin/pipeline');

        return {
            success: true,
            syncRunId: result.syncRunId,
            summary: {
                totalInFile: result.totalInFile,
                matchedProducts: result.matchedProducts,
                unchangedProducts: result.unchangedProducts,
                registerOnlyCount: result.registerOnlyCount,
                websiteOnlyCount: result.websiteOnlyCount,
                priceMismatchCount: result.priceMismatchCount,
                quantityMismatchCount: result.quantityMismatchCount,
                stockStatusMismatchCount: result.stockStatusMismatchCount,
                totalIssues: result.issues.length,
            },
        };
    } catch (error) {
        console.error('Integra reconciliation error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Reconciliation failed' };
    }
}

/**
 * Pushes selected register-only items to the pipeline.
 */
export async function pushReconciliationItemsToPipelineAction(params: { issueIds?: string[]; syncRunId?: string }): Promise<ActionState & { count?: number }> {
    try {
        const result = await pushRegisterOnlyIssuesToPipeline(params);
        revalidatePath('/admin/pipeline');
        return { success: result.success, count: result.count, error: result.errors.join(', ') || undefined };
    } catch (error) {
        console.error('Push to pipeline error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Push failed' };
    }
}
