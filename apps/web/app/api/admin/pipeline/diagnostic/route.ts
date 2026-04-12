import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PERSISTED_PIPELINE_STATUSES, type PersistedPipelineStatus } from '@/lib/pipeline/types';

const PROJECT_ID = 'fapnuczapctelxxmrail';

export async function GET() {
    try {
        const supabase = await createClient();

        const [
            { data: productsData, error: productsError },
            { count: exportQueueCount, error: exportQueueError },
        ] = await Promise.all([
            supabase
                .from('products_ingestion')
                .select('pipeline_status, exported_at'),
            supabase
                .from('products_ingestion')
                .select('sku', { count: 'exact', head: true })
                .eq('pipeline_status', 'exporting')
                .is('exported_at', null),
        ]);

        if (productsError) {
            console.error('Error fetching products_ingestion:', productsError);
            return NextResponse.json(
                { error: 'Failed to query products_ingestion', details: productsError.message },
                { status: 500 }
            );
        }

        if (exportQueueError) {
            console.error('Warning: Error fetching pipeline_export_queue:', exportQueueError);
        }

        // Calculate counts by status
        const byStatus: Record<PersistedPipelineStatus, number> = {
            imported: 0,
            scraping: 0,
            scraped: 0,
            consolidating: 0,
            finalizing: 0,
            exporting: 0,
            failed: 0,
        };

        let totalProducts = 0;
        (productsData || []).forEach((row: { pipeline_status?: string; exported_at?: string | null }) => {
            if (row.pipeline_status && PERSISTED_PIPELINE_STATUSES.includes(row.pipeline_status as PersistedPipelineStatus)) {
                byStatus[row.pipeline_status as PersistedPipelineStatus]++;
            }
            if (!row.exported_at) {
                totalProducts++;
            }
        });

        // Query scrape_jobs for active job counts
        const { data: jobsData, error: jobsError } = await supabase
            .from('scrape_jobs')
            .select('job_type, status');

        let scrapingCount = 0;
        let consolidationCount = 0;

        if (jobsError) {
            console.error('Warning: Error fetching scrape_jobs:', jobsError);
            // Continue with zero counts rather than failing
        } else {
            (jobsData || []).forEach((job: { job_type?: string; status?: string }) => {
                // Count jobs that are not completed/failed/cancelled
                const isActive = job.status && !['completed', 'failed', 'cancelled'].includes(job.status);
                if (isActive) {
                    if (job.job_type === 'consolidation') {
                        consolidationCount++;
                    } else {
                        scrapingCount++;
                    }
                }
            });
        }

        const response = {
            timestamp: new Date().toISOString(),
            summary: {
                total_products: totalProducts,
                by_status: byStatus,
                export_queue: exportQueueCount || 0,
            },
            active_jobs: {
                scraping: scrapingCount,
                consolidation: consolidationCount,
            },
            metadata: {
                table: 'products_ingestion',
                project: PROJECT_ID,
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Exception in diagnostic route:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
