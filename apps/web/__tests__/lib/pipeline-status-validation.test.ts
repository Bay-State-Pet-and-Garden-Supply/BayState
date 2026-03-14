/**
 * @jest-environment node
 */
import {
    NewPipelineStatus,
    STATUS_TRANSITIONS,
    validateStatusTransition,
} from '@/lib/pipeline';

describe('validateStatusTransition', () => {
    describe('valid transitions', () => {
        it('allows registered -> enriched', () => {
            expect(validateStatusTransition('registered', 'enriched')).toBe(true);
        });

        it('allows enriched -> finalized', () => {
            expect(validateStatusTransition('enriched', 'finalized')).toBe(true);
        });
    });

    describe('invalid transitions', () => {
        it('rejects registered -> finalized (skipping enriched)', () => {
            expect(validateStatusTransition('registered', 'finalized')).toBe(false);
        });

        it('rejects enriched -> registered (going backwards)', () => {
            expect(validateStatusTransition('enriched', 'registered')).toBe(false);
        });

        it('rejects finalized -> registered (from terminal state)', () => {
            expect(validateStatusTransition('finalized', 'registered')).toBe(false);
        });

        it('rejects finalized -> enriched (from terminal state)', () => {
            expect(validateStatusTransition('finalized', 'enriched')).toBe(false);
        });

        it('rejects registered -> registered (self-transition)', () => {
            expect(validateStatusTransition('registered', 'registered')).toBe(false);
        });

        it('rejects enriched -> enriched (self-transition)', () => {
            expect(validateStatusTransition('enriched', 'enriched')).toBe(false);
        });

        it('rejects finalized -> finalized (self-transition from terminal)', () => {
            expect(validateStatusTransition('finalized', 'finalized')).toBe(false);
        });
    });

    describe('STATUS_TRANSITIONS constant', () => {
        it('has correct transitions for registered', () => {
            expect(STATUS_TRANSITIONS.registered).toEqual(['enriched']);
        });

        it('has correct transitions for enriched', () => {
            expect(STATUS_TRANSITIONS.enriched).toEqual(['finalized']);
        });

        it('has no transitions for finalized (terminal state)', () => {
            expect(STATUS_TRANSITIONS.finalized).toEqual([]);
        });

        it('has exactly 3 statuses', () => {
            const statuses = Object.keys(STATUS_TRANSITIONS);
            expect(statuses).toHaveLength(3);
            expect(statuses).toContain('registered');
            expect(statuses).toContain('enriched');
            expect(statuses).toContain('finalized');
        });
    });

    describe('NewPipelineStatus type', () => {
        it('accepts all valid status values', () => {
            const validStatuses: NewPipelineStatus[] = ['registered', 'enriched', 'finalized'];
            
            // TypeScript compile-time check - if this compiles, the type is correct
            validStatuses.forEach((status) => {
                expect(status).toBeDefined();
            });
        });
    });
});
