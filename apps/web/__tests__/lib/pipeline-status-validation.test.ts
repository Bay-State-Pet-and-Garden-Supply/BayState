/**
 * @jest-environment node
 */
import { validateStatusTransition } from '@/lib/pipeline';
import {
    PERSISTED_PIPELINE_STATUSES,
    type PersistedPipelineStatus,
} from '@/lib/pipeline/types';

describe('validateStatusTransition', () => {
    const statuses: PersistedPipelineStatus[] = [...PERSISTED_PIPELINE_STATUSES];

    it('allows same-status transitions for every canonical state', () => {
        statuses.forEach(status => {
            expect(validateStatusTransition(status, status)).toBe(true);
        });
    });

    it('allows canonical forward and retry/rework transitions', () => {
        // NOTE: imported -> searching is intentionally removed (static scrape always first)
        expect(validateStatusTransition('imported', 'searching')).toBe(false);
        expect(validateStatusTransition('searching', 'url_review')).toBe(true);
        expect(validateStatusTransition('url_review', 'extracting')).toBe(true);
        expect(validateStatusTransition('url_review', 'scraping')).toBe(true);
        expect(validateStatusTransition('extracting', 'scraped')).toBe(true);
        expect(validateStatusTransition('imported', 'scraping')).toBe(true);
        expect(validateStatusTransition('scraping', 'scraped')).toBe(true);
        expect(validateStatusTransition('scraping', 'failed')).toBe(true);
        expect(validateStatusTransition('scraping', 'imported')).toBe(true);
        expect(validateStatusTransition('scraped', 'consolidating')).toBe(true);
        expect(validateStatusTransition('scraped', 'finalizing')).toBe(true);
        expect(validateStatusTransition('scraped', 'imported')).toBe(true);
        expect(validateStatusTransition('scraped', 'failed')).toBe(true);
        expect(validateStatusTransition('consolidating', 'finalizing')).toBe(true);
        expect(validateStatusTransition('finalizing', 'exporting')).toBe(true);
        expect(validateStatusTransition('finalizing', 'scraped')).toBe(true);
        expect(validateStatusTransition('exporting', 'finalizing')).toBe(true);
        expect(validateStatusTransition('failed', 'imported')).toBe(true);
    });

    it('rejects invalid canonical transitions', () => {
        expect(validateStatusTransition('imported', 'finalizing')).toBe(false);
        expect(validateStatusTransition('imported', 'failed')).toBe(false);
        expect(validateStatusTransition('imported', 'searching')).toBe(false);
        expect(validateStatusTransition('searching', 'scraped')).toBe(false);
        expect(validateStatusTransition('url_review', 'finalizing')).toBe(false);
        expect(validateStatusTransition('extracting', 'exporting')).toBe(false);
        expect(validateStatusTransition('scraped', 'exporting')).toBe(false);
        expect(validateStatusTransition('finalizing', 'imported')).toBe(false);
        expect(validateStatusTransition('exporting', 'imported')).toBe(false);
        expect(validateStatusTransition('failed', 'scraped')).toBe(false);
        expect(validateStatusTransition('failed', 'exporting')).toBe(false);
        expect(validateStatusTransition('needs_fallback_review', 'finalizing')).toBe(false);
        expect(validateStatusTransition('needs_fallback_review', 'extracting')).toBe(false);
        expect(validateStatusTransition('scraped', 'searching')).toBe(false);
    });

    it('enforces the full canonical transition matrix', () => {
        // Exclude needs_fallback_review — it's a legacy persisted status with no transitions
        const matrixStatuses = statuses.filter(s => s !== 'needs_fallback_review');
        const validTargets: Record<PersistedPipelineStatus, PersistedPipelineStatus[]> = {
            imported: ['imported', 'scraping'],
            searching: ['searching', 'url_review', 'imported', 'failed'],
            url_review: ['url_review', 'extracting', 'scraping', 'imported', 'failed'],
            extracting: ['extracting', 'scraped', 'url_review', 'failed'],
            scraping: ['scraping', 'scraped', 'failed', 'imported'],
            scraped: ['scraped', 'consolidating', 'finalizing', 'imported', 'failed'],
            consolidating: ['consolidating', 'finalizing', 'scraped', 'failed'],
            finalizing: ['finalizing', 'exporting', 'scraped', 'failed'],
            exporting: ['exporting', 'finalizing', 'failed'],
            failed: ['failed', 'imported', 'url_review'],
        } as Record<PersistedPipelineStatus, PersistedPipelineStatus[]>;

        matrixStatuses.forEach(from => {
            matrixStatuses.forEach(to => {
                expect(validateStatusTransition(from, to)).toBe(validTargets[from].includes(to));
            });
        });

        // Same-status for needs_fallback_review is allowed, but no other transitions
        expect(validateStatusTransition('needs_fallback_review', 'needs_fallback_review')).toBe(true);
        expect(validateStatusTransition('needs_fallback_review', 'imported')).toBe(false);
    });
});
