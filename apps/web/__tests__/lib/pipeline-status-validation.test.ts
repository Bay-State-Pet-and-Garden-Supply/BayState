/**
 * @jest-environment node
 */
import { validateStatusTransition } from '@/lib/pipeline';
import type { PersistedPipelineStatus } from '@/lib/pipeline/types';

describe('validateStatusTransition', () => {
    const statuses: PersistedPipelineStatus[] = ['imported', 'scraping', 'scraped', 'consolidating', 'finalizing', 'exporting', 'failed'];

    it('allows same-status transitions for every canonical state', () => {
        statuses.forEach(status => {
            expect(validateStatusTransition(status, status)).toBe(true);
        });
    });

    it('allows canonical forward and retry/rework transitions', () => {
        expect(validateStatusTransition('imported', 'scraping')).toBe(true);
        expect(validateStatusTransition('scraping', 'scraped')).toBe(true);
        expect(validateStatusTransition('scraped', 'consolidating')).toBe(true);
        expect(validateStatusTransition('scraped', 'finalizing')).toBe(true);
        expect(validateStatusTransition('consolidating', 'finalizing')).toBe(true);
        expect(validateStatusTransition('finalizing', 'exporting')).toBe(true);
        expect(validateStatusTransition('finalizing', 'scraped')).toBe(true);
        expect(validateStatusTransition('exporting', 'finalizing')).toBe(true);
        expect(validateStatusTransition('failed', 'imported')).toBe(true);
    });

    it('rejects invalid canonical transitions', () => {
        expect(validateStatusTransition('imported', 'finalizing')).toBe(false);
        expect(validateStatusTransition('imported', 'failed')).toBe(false);
        expect(validateStatusTransition('scraped', 'exporting')).toBe(false);
        expect(validateStatusTransition('finalizing', 'imported')).toBe(false);
        expect(validateStatusTransition('exporting', 'imported')).toBe(false);
        expect(validateStatusTransition('failed', 'scraped')).toBe(false);
        expect(validateStatusTransition('failed', 'exporting')).toBe(false);
    });

    it('enforces the full canonical transition matrix', () => {
        const validTargets: Record<PersistedPipelineStatus, PersistedPipelineStatus[]> = {
            imported: ['imported', 'scraping'],
            scraping: ['scraping', 'scraped', 'failed', 'imported'],
            scraped: ['scraped', 'consolidating', 'finalizing', 'imported', 'failed'],
            consolidating: ['consolidating', 'finalizing', 'scraped', 'failed'],
            finalizing: ['finalizing', 'exporting', 'scraped', 'failed'],
            exporting: ['exporting', 'finalizing', 'failed'],
            failed: ['failed', 'imported'],
        };

        statuses.forEach(from => {
            statuses.forEach(to => {
                expect(validateStatusTransition(from, to)).toBe(validTargets[from].includes(to));
            });
        });
    });
});
