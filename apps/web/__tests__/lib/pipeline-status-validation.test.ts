/**
 * @jest-environment node
 */
import { validateStatusTransition, PipelineStatus } from '@/lib/pipeline';

describe('validateStatusTransition', () => {
    const statuses: PipelineStatus[] = ['imported', 'monitoring', 'scraped', 'consolidated', 'finalized', 'published'];

    describe('valid transitions', () => {
        it('should allow imported → monitoring', () => {
            expect(validateStatusTransition('imported', 'monitoring')).toBe(true);
        });

        it('should allow imported → scraped', () => {
            expect(validateStatusTransition('imported', 'scraped')).toBe(true);
        });

        it('should allow monitoring → imported', () => {
            expect(validateStatusTransition('monitoring', 'imported')).toBe(true);
        });

        it('should allow monitoring → scraped', () => {
            expect(validateStatusTransition('monitoring', 'scraped')).toBe(true);
        });

        it('should allow scraped → consolidated', () => {
            expect(validateStatusTransition('scraped', 'consolidated')).toBe(true);
        });

        it('should allow scraped → finalized', () => {
            expect(validateStatusTransition('scraped', 'finalized')).toBe(true);
        });

        it('should allow consolidated → finalized', () => {
            expect(validateStatusTransition('consolidated', 'finalized')).toBe(true);
        });

        it('should allow finalized → published', () => {
            expect(validateStatusTransition('finalized', 'published')).toBe(true);
        });

        it('should allow finalized → scraped', () => {
            expect(validateStatusTransition('finalized', 'scraped')).toBe(true);
        });

        it('should allow same status transition: imported → imported', () => {
            expect(validateStatusTransition('imported', 'imported')).toBe(true);
        });

        it('should allow same status transition: scraped → scraped', () => {
            expect(validateStatusTransition('scraped', 'scraped')).toBe(true);
        });

        it('should allow same status transition: published → published', () => {
            expect(validateStatusTransition('published', 'published')).toBe(true);
        });
    });

    describe('invalid transitions', () => {
        it('should NOT allow imported → consolidated (skip intermediate)', () => {
            expect(validateStatusTransition('imported', 'consolidated')).toBe(false);
        });

        it('should NOT allow imported → published (skip multiple stages)', () => {
            expect(validateStatusTransition('imported', 'published')).toBe(false);
        });

        it('should NOT allow published → finalized (terminal state)', () => {
            expect(validateStatusTransition('published', 'finalized')).toBe(false);
        });

        it('should NOT allow published → any other status', () => {
            expect(validateStatusTransition('published', 'imported')).toBe(false);
            expect(validateStatusTransition('published', 'scraped')).toBe(false);
            expect(validateStatusTransition('published', 'consolidated')).toBe(false);
            expect(validateStatusTransition('published', 'finalized')).toBe(false);
        });
    });

    describe('all status combinations', () => {
        it('should test all 6 statuses with correct transitions', () => {
            // imported can go to: imported, monitoring, scraped
            expect(validateStatusTransition('imported', 'imported')).toBe(true);
            expect(validateStatusTransition('imported', 'monitoring')).toBe(true);
            expect(validateStatusTransition('imported', 'scraped')).toBe(true);
            expect(validateStatusTransition('imported', 'consolidated')).toBe(false);
            expect(validateStatusTransition('imported', 'finalized')).toBe(false);
            expect(validateStatusTransition('imported', 'published')).toBe(false);

            // monitoring can go to: monitoring, imported, scraped
            expect(validateStatusTransition('monitoring', 'imported')).toBe(true);
            expect(validateStatusTransition('monitoring', 'monitoring')).toBe(true);
            expect(validateStatusTransition('monitoring', 'scraped')).toBe(true);
            expect(validateStatusTransition('monitoring', 'consolidated')).toBe(false);
            expect(validateStatusTransition('monitoring', 'finalized')).toBe(false);
            expect(validateStatusTransition('monitoring', 'published')).toBe(false);

            // scraped can go to: scraped, imported, consolidated, finalized
            expect(validateStatusTransition('scraped', 'imported')).toBe(true);
            expect(validateStatusTransition('scraped', 'monitoring')).toBe(false);
            expect(validateStatusTransition('scraped', 'scraped')).toBe(true);
            expect(validateStatusTransition('scraped', 'consolidated')).toBe(true);
            expect(validateStatusTransition('scraped', 'finalized')).toBe(true);
            expect(validateStatusTransition('scraped', 'published')).toBe(false);

            // consolidated can go to: consolidated, finalized, scraped
            expect(validateStatusTransition('consolidated', 'imported')).toBe(false);
            expect(validateStatusTransition('consolidated', 'monitoring')).toBe(false);
            expect(validateStatusTransition('consolidated', 'scraped')).toBe(true);
            expect(validateStatusTransition('consolidated', 'consolidated')).toBe(true);
            expect(validateStatusTransition('consolidated', 'finalized')).toBe(true);
            expect(validateStatusTransition('consolidated', 'published')).toBe(false);

            // finalized can go to: finalized, published, consolidated, scraped
            expect(validateStatusTransition('finalized', 'imported')).toBe(false);
            expect(validateStatusTransition('finalized', 'monitoring')).toBe(false);
            expect(validateStatusTransition('finalized', 'scraped')).toBe(true);
            expect(validateStatusTransition('finalized', 'consolidated')).toBe(true);
            expect(validateStatusTransition('finalized', 'finalized')).toBe(true);
            expect(validateStatusTransition('finalized', 'published')).toBe(true);

            // published can only go to itself (terminal state)
            expect(validateStatusTransition('published', 'imported')).toBe(false);
            expect(validateStatusTransition('published', 'scraped')).toBe(false);
            expect(validateStatusTransition('published', 'consolidated')).toBe(false);
            expect(validateStatusTransition('published', 'finalized')).toBe(false);
            expect(validateStatusTransition('published', 'published')).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle all valid transitions from imported', () => {
            const from: PipelineStatus = 'imported';
            const validTargets: PipelineStatus[] = ['imported', 'monitoring', 'scraped'];
            
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                if (validTargets.includes(to)) {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });

        it('should handle all valid transitions from monitoring', () => {
            const from: PipelineStatus = 'monitoring';
            const validTargets: PipelineStatus[] = ['imported', 'monitoring', 'scraped'];
            
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                if (validTargets.includes(to)) {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });

        it('should handle all valid transitions from scraped', () => {
            const from: PipelineStatus = 'scraped';
            const validTargets: PipelineStatus[] = ['imported', 'scraped', 'consolidated', 'finalized'];
            
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                if (validTargets.includes(to)) {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });

        it('should handle all valid transitions from published (terminal)', () => {
            const from: PipelineStatus = 'published';
            
            statuses.forEach((to) => {
                const result = validateStatusTransition(from, to);
                // Only published should be valid from 'published' (terminal state)
                if (to === 'published') {
                    expect(result).toBe(true);
                } else {
                    expect(result).toBe(false);
                }
            });
        });
    });
});
