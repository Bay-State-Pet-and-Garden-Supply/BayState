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
        expect(validateStatusTransition('imported', 'extracting')).toBe(true);
        expect(validateStatusTransition('imported', 'failed')).toBe(true);
        expect(validateStatusTransition('extracting', 'processed')).toBe(true);
        expect(validateStatusTransition('extracting', 'imported')).toBe(true);
        expect(validateStatusTransition('extracting', 'failed')).toBe(true);
        expect(validateStatusTransition('processed', 'merging')).toBe(true);
        expect(validateStatusTransition('processed', 'reviewing')).toBe(true);
        expect(validateStatusTransition('processed', 'imported')).toBe(true);
        expect(validateStatusTransition('processed', 'failed')).toBe(true);
        expect(validateStatusTransition('merging', 'reviewing')).toBe(true);
        expect(validateStatusTransition('merging', 'processed')).toBe(true);
        expect(validateStatusTransition('merging', 'failed')).toBe(true);
        expect(validateStatusTransition('reviewing', 'publishing')).toBe(true);
        expect(validateStatusTransition('reviewing', 'processed')).toBe(true);
        expect(validateStatusTransition('publishing', 'reviewing')).toBe(true);
        expect(validateStatusTransition('publishing', 'failed')).toBe(true);
        expect(validateStatusTransition('failed', 'imported')).toBe(true);
        expect(validateStatusTransition('failed', 'extracting')).toBe(true);
    });

    it('rejects invalid canonical transitions', () => {
        expect(validateStatusTransition('imported', 'processed')).toBe(false);
        expect(validateStatusTransition('imported', 'failed')).toBe(true);
        expect(validateStatusTransition('imported', 'publishing')).toBe(false);
        expect(validateStatusTransition('extracting', 'publishing')).toBe(false);
        expect(validateStatusTransition('extracting', 'merging')).toBe(false);
        expect(validateStatusTransition('processed', 'publishing')).toBe(false);
        expect(validateStatusTransition('processed', 'extracting')).toBe(true);
        expect(validateStatusTransition('merging', 'publishing')).toBe(false);
        expect(validateStatusTransition('merging', 'extracting')).toBe(false);
        expect(validateStatusTransition('reviewing', 'imported')).toBe(false);
        expect(validateStatusTransition('publishing', 'imported')).toBe(false);
        expect(validateStatusTransition('failed', 'publishing')).toBe(false);
        expect(validateStatusTransition('failed', 'processed')).toBe(false);
    });

    it('enforces the full canonical transition matrix', () => {
        const matrixStatuses = statuses;
        const validTargets: Record<PersistedPipelineStatus, PersistedPipelineStatus[]> = {
            imported: ['imported', 'extracting', 'awaiting_brand', 'failed'],
            awaiting_brand: ['awaiting_brand', 'imported', 'failed'],
            extracting: ['extracting', 'processed', 'needs_attention', 'imported', 'failed'],
            processed: ['processed', 'extracting', 'merging', 'reviewing', 'imported', 'failed'],
            merging: ['merging', 'reviewing', 'processed', 'failed'],
            reviewing: ['reviewing', 'publishing', 'processed', 'failed'],
            publishing: ['publishing', 'reviewing', 'failed'],
            needs_attention: ['needs_attention', 'imported', 'extracting', 'processed', 'failed'],
            failed: ['failed', 'imported', 'extracting'],
        } as Record<PersistedPipelineStatus, PersistedPipelineStatus[]>;

        matrixStatuses.forEach(from => {
            matrixStatuses.forEach(to => {
                expect(validateStatusTransition(from, to)).toBe(validTargets[from].includes(to));
            });
        });
    });
});
