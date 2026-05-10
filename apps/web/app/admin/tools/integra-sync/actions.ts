'use server';

import { revalidatePath } from 'next/cache';
import { ActionState } from '@/lib/types';
import { runIntegraReconciliation, pushRegisterOnlyIssuesToPipeline, addToOnboarding, IntegraProduct } from '@/lib/admin/integra-sync';
import { createClient } from '@/lib/supabase/server';

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

        revalidatePath('/admin/tools/integra-sync');
        revalidatePath('/admin/inventory');

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

export async function pushReconciliationItemsToPipelineAction(issueIds: string[]): Promise<ActionState & { count?: number }> {
    try {
        const result = await pushRegisterOnlyIssuesToPipeline(issueIds);
        revalidatePath('/admin/tools/integra-sync');
        revalidatePath('/admin/inventory');
        return { success: result.success, count: result.count, error: result.errors.join(', ') || undefined };
    } catch (error) {
        console.error('Push to pipeline error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Push failed' };
    }
}

export async function processOnboardingAction(products: IntegraProduct[]) {
    try {
        const result = await addToOnboarding(products);
        if (result.success) {
            revalidatePath('/admin/pipeline');
            return { success: true, count: result.count, cohorts: result.cohorts };
        } else {
            return { success: false, error: 'Failed to add products to onboarding' };
        }
    } catch (error) {
        console.error('Onboarding processing error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
