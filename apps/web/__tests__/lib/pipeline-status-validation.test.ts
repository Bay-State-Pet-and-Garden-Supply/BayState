/**
 * @jest-environment node
 */
import { validateStatusTransition, NewPipelineStatus } from '@/lib/pipeline';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

describe('validateStatusTransition', () => {
    const statuses: NewPipelineStatus[] = ['registered', 'enriched', 'finalized'];

    describe('valid transitions', () => {
        it('should allow registered → enriched', () => {
            expect(validateStatusTransition('registered', 'enriched')).toBe(true);
        });

        it('should allow enriched → finalized', () => {
            expect(validateStatusTransition('enriched', 'finalized')).toBe(true);
        });

        it('should allow same status transition: registered → registered', () => {
            expect(validateStatusTransition('registered', 'registered')).toBe(true);
        });

        it('should allow same status transition: enriched → enriched', () => {
            expect(validateStatusTransition('enriched', 'enriched')).toBe(true);
        });

        it('should allow same status transition: finalized → finalized', () => {
            expect(validateStatusTransition('finalized', 'finalized')).toBe(true);
        });
    });

    describe('invalid transitions', () => {
        it('should NOT allow registered → finalized (skip intermediate)', () => {
            expect(validateStatusTransition('registered', 'finalized')).toBe(false);
        });

        it('should NOT allow finalized → enriched (terminal state)', () => {
            expect(validateStatusTransition('finalized', 'enriched')).toBe(false);
        });

        it('should NOT allow finalized → registered (terminal state)', () => {
            expect(validateStatusTransition('finalized', 'registered')).toBe(false);
        });

        it('should NOT allow enriched → registered (backwards)', () => {
            expect(validateStatusTransition('enriched', 'registered')).toBe(false);
        });

        it('should NOT allow finalized → registered (backwards from terminal)', () => {
            expect(validateStatusTransition('finalized', 'registered')).toBe(false);
        });
    });

    describe('all status combinations', () => {
        it('should test all 3 statuses as from and to', () => {
            // registered can go to: registered, enriched
            expect(validateStatusTransition('registered', 'registered')).toBe(true);
            expect(validateStatusTransition('registered', 'enriched')).toBe(true);
            expect(validateStatusTransition('registered', 'finalized')).toBe(false);

            // enriched can go to: enriched, finalized
            expect(validateStatusTransition('enriched', 'registered')).toBe(false);
            expect(validateStatusTransition('enriched', 'enriched')).toBe(true);
            expect(validateStatusTransition('enriched', 'finalized')).toBe(true);

            // finalized can only go to itself (terminal state)
            expect(validateStatusTransition('finalized', 'registered')).toBe(false);
            expect(validateStatusTransition('finalized', 'enriched')).toBe(false);
            expect(validateStatusTransition('finalized', 'finalized')).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle all valid transitions from registered', () => {
            const from: NewPipelineStatus = 'registered';
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                // Only registered and enriched should be valid from 'registered'
                if (to === 'registered' || to === 'enriched') {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });

        it('should handle all valid transitions from enriched', () => {
            const from: NewPipelineStatus = 'enriched';
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                // Only enriched and finalized should be valid from 'enriched'
                if (to === 'enriched' || to === 'finalized') {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });

        it('should handle all valid transitions from finalized', () => {
            const from: NewPipelineStatus = 'finalized';
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                // Only finalized should be valid from 'finalized' (terminal state)
                if (to === 'finalized') {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });
    });
});
