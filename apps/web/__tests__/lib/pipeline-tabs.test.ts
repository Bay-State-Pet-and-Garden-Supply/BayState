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
        it('should include all 10 required tabs', () => {
            const expectedTabs: PipelineTab[] = [
                'staging',
                'active-runs',
                'scraped',
                'active-consolidations',
                'consolidated',
                'approved',
                'images',
                'export',
                'published',
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
            expect(TAB_CONFIG['staging'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['active-runs'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['scraped'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['active-consolidations'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['consolidated'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['approved'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['images'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['export'].isStatusTab).toBe(false);
            expect(TAB_CONFIG['published'].isStatusTab).toBe(true);
            expect(TAB_CONFIG['failed'].isStatusTab).toBe(true);
        });
    });

    describe('getTabOrder', () => {
        it('should return tabs in correct display order', () => {
            const order = getTabOrder();

            expect(order).toHaveLength(10);
            expect(order[0]).toBe('staging');
            expect(order[1]).toBe('active-runs');
            expect(order[2]).toBe('scraped');
            expect(order[3]).toBe('active-consolidations');
            expect(order[4]).toBe('consolidated');
            expect(order[5]).toBe('approved');
            expect(order[6]).toBe('images');
            expect(order[7]).toBe('export');
            expect(order[8]).toBe('published');
            expect(order[9]).toBe('failed');
        });

        it('should return tabs sorted by order property', () => {
            const order = getTabOrder();

            for (let i = 1; i < order.length; i++) {
                expect(TAB_CONFIG[order[i - 1]].order).toBeLessThan(TAB_CONFIG[order[i]].order);
            }
        });
    });

    describe('isStatusTab', () => {
        it('should return true for status tabs', () => {
            expect(isStatusTab('staging')).toBe(true);
            expect(isStatusTab('scraped')).toBe(true);
            expect(isStatusTab('consolidated')).toBe(true);
            expect(isStatusTab('approved')).toBe(true);
            expect(isStatusTab('published')).toBe(true);
            expect(isStatusTab('failed')).toBe(true);
        });

        it('should return false for non-status tabs', () => {
            expect(isStatusTab('active-runs')).toBe(false);
            expect(isStatusTab('active-consolidations')).toBe(false);
            expect(isStatusTab('images')).toBe(false);
            expect(isStatusTab('export')).toBe(false);
        });
    });

    describe('isMonitoringTab', () => {
        it('should return true for active-runs and active-consolidations', () => {
            expect(isMonitoringTab('active-runs')).toBe(true);
            expect(isMonitoringTab('active-consolidations')).toBe(true);
        });

        it('should return false for other tabs', () => {
            expect(isMonitoringTab('staging')).toBe(false);
            expect(isMonitoringTab('scraped')).toBe(false);
            expect(isMonitoringTab('consolidated')).toBe(false);
            expect(isMonitoringTab('approved')).toBe(false);
            expect(isMonitoringTab('images')).toBe(false);
            expect(isMonitoringTab('export')).toBe(false);
            expect(isMonitoringTab('published')).toBe(false);
            expect(isMonitoringTab('failed')).toBe(false);
        });
    });

    describe('isActionTab', () => {
        it('should return true for images and export tabs', () => {
            expect(isActionTab('images')).toBe(true);
            expect(isActionTab('export')).toBe(true);
        });

        it('should return false for other tabs', () => {
            expect(isActionTab('staging')).toBe(false);
            expect(isActionTab('active-runs')).toBe(false);
            expect(isActionTab('scraped')).toBe(false);
            expect(isActionTab('active-consolidations')).toBe(false);
            expect(isActionTab('consolidated')).toBe(false);
            expect(isActionTab('approved')).toBe(false);
            expect(isActionTab('published')).toBe(false);
            expect(isActionTab('failed')).toBe(false);
        });
    });
});
