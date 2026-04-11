/**
 * @jest-environment node
 */
import { validateStatusTransition } from '@/lib/pipeline';
import type { PersistedPipelineStatus } from '@/lib/pipeline/types';

describe('validateStatusTransition', () => {
    const statuses: PersistedPipelineStatus[] = ['imported', 'scraped', 'finalized', 'failed'];

    it('allows same-status transitions for every canonical state', () => {
        statuses.forEach(status => {
            expect(validateStatusTransition(status, status)).toBe(true);
        });
    });

    it('allows canonical forward and retry/rework transitions', () => {
        expect(validateStatusTransition('imported', 'scraped')).toBe(true);
        expect(validateStatusTransition('scraped', 'finalized')).toBe(true);
        expect(validateStatusTransition('scraped', 'imported')).toBe(true);
        expect(validateStatusTransition('finalized', 'scraped')).toBe(true);
        expect(validateStatusTransition('failed', 'imported')).toBe(true);
    });

    it('rejects invalid canonical transitions', () => {
        expect(validateStatusTransition('imported', 'finalized')).toBe(false);
        expect(validateStatusTransition('imported', 'failed')).toBe(false);
        expect(validateStatusTransition('scraped', 'failed')).toBe(false);
        expect(validateStatusTransition('finalized', 'imported')).toBe(false);
        expect(validateStatusTransition('finalized', 'failed')).toBe(false);
        expect(validateStatusTransition('failed', 'scraped')).toBe(false);
        expect(validateStatusTransition('failed', 'finalized')).toBe(false);
    });

    it('enforces the full canonical transition matrix', () => {
        const validTargets: Record<PersistedPipelineStatus, PersistedPipelineStatus[]> = {
            imported: ['imported', 'scraped'],
            scraped: ['scraped', 'finalized', 'imported'],
            finalized: ['finalized', 'scraped'],
            failed: ['failed', 'imported'],
        };

        statuses.forEach(from => {
            statuses.forEach(to => {
                expect(validateStatusTransition(from, to)).toBe(validTargets[from].includes(to));
            });
        });
    });
});
