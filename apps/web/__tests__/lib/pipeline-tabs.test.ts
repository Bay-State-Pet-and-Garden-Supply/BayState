import {
    PipelineTab,
    TAB_CONFIG,
    getTabOrder,
    isStatusTab,
    isMonitoringTab,
    isActionTab,
} from '@/lib/pipeline-tabs';

describe('pipeline-tabs', () => {
    describe('PipelineTab type', () => {
        it('should include all required tabs', () => {
            const expectedTabs: PipelineTab[] = [
                'imported',
                'monitoring',
                'scraped',
                'consolidating',
                'finalized',
                'published',
                'images',
                'export',
                'failed',
            ];

            expectedTabs.forEach(tab => {
                expect(TAB_CONFIG[tab]).toBeDefined();
            });
        });
    });

    describe('TAB_CONFIG', () => {
        it('should have label for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].label).toBe('string');
                expect(TAB_CONFIG[tab].label.length).toBeGreaterThan(0);
            });
        });

        it('should have icon string (not component) for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].icon).toBe('string');
            });
        });

        it('should have description for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].description).toBe('string');
                expect(TAB_CONFIG[tab].description.length).toBeGreaterThan(0);
            });
        });

        it('should have color for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].color).toBe('string');
            });
        });

        it('should have bgColor for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].bgColor).toBe('string');
            });
        });

        it('should have isStatusTab boolean for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].isStatusTab).toBe('boolean');
            });
        });

        it('should have order number for each tab', () => {
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                expect(typeof TAB_CONFIG[tab].order).toBe('number');
            });
        });

        it('should have correct isStatusTab values', () => {
            expect(TAB_CONFIG['imported'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['monitoring'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['scraped'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['consolidating'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['images'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['export'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['finalized'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['failed'].isStatusTab).toBe(true);
        });
    });

    describe('getTabOrder', () => {
        it('should return tabs in correct display order', () => {
            const order = getTabOrder();

            expect(order).toEqual([
                'imported',
                'monitoring',
                'scraped',
                'consolidating',
                'finalized',
                'published',
                'images',
                'export',
                'failed',
            ]);
        });

        it('should return tabs sorted by order property', () => {
            const order = getTabOrder();

            for (let i = 1; i < order.length; i++) {
                expect(TAB_CONFIG[order[i - 1]].order).toBeLessThanOrEqual(TAB_CONFIG[order[i]].order);
            }
        });
    });

    describe('isStatusTab', () => {
        it('should return true for status tabs', () => {
            expect(isStatusTab('imported')).toBe(true);
            expect(isStatusTab('scraped')).toBe(true);
            expect(isStatusTab('finalized')).toBe(true);
            expect(isStatusTab('failed')).toBe(true);
        });

        it('should return false for non-status tabs', () => {
            expect(isStatusTab('monitoring')).toBe(false);
            expect(isStatusTab('consolidating')).toBe(false);
            expect(isStatusTab('images')).toBe(false);
            expect(isStatusTab('export')).toBe(false);
        });
    });

    describe('isMonitoringTab', () => {
        it('should return true for monitoring and consolidating tabs', () => {
            expect(isMonitoringTab('monitoring')).toBe(true);
            expect(isMonitoringTab('consolidating')).toBe(true);
        });

        it('should return false for other tabs', () => {
            expect(isMonitoringTab('images')).toBe(false);
            expect(isMonitoringTab('export')).toBe(false);
            expect(isMonitoringTab('finalized')).toBe(false);
            expect(isMonitoringTab('failed')).toBe(false);
        });
    });

    describe('isActionTab', () => {
        it('should return true for images and export tabs', () => {
            expect(isActionTab('images')).toBe(true);
            expect(isActionTab('export')).toBe(true);
        });

        it('should return false for other tabs', () => {
            expect(isActionTab('monitoring')).toBe(false);
            expect(isActionTab('consolidating')).toBe(false);
            expect(isActionTab('finalized')).toBe(false);
            expect(isActionTab('failed')).toBe(false);
        });
    });
});
