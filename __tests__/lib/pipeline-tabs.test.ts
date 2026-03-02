/**
 * @jest-environment node
 */
import { 
    PipelineTab, 
    TAB_CONFIG, 
    getTabOrder, 
    isStatusTab, 
    isMonitoringTab, 
    isActionTab 
} from '@/lib/pipeline-tabs';

describe('pipeline-tabs', () => {
    describe('PipelineTab type', () => {
        it('should accept all 10 pipeline tab values', () => {
            const tabs: PipelineTab[] = [
                'staging',
                'active-runs',
                'scraped',
                'active-consolidations',
                'consolidated',
                'approved',
                'images',
                'export',
                'published',
                'failed'
            ];
            expect(tabs).toHaveLength(10);
        });
    });

    describe('TAB_CONFIG', () => {
        it('should have configuration for all 10 tabs', () => {
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
                'failed'
            ];
            
            expectedTabs.forEach(tab => {
                expect(TAB_CONFIG[tab]).toBeDefined();
            });
        });

        it('should have correct order values for each tab', () => {
            // Verify order matches expected sequence
            expect(TAB_CONFIG['staging'].order).toBe(0);
            expect(TAB_CONFIG['active-runs'].order).toBe(1);
            expect(TAB_CONFIG['scraped'].order).toBe(2);
            expect(TAB_CONFIG['active-consolidations'].order).toBe(3);
            expect(TAB_CONFIG['consolidated'].order).toBe(4);
            expect(TAB_CONFIG['approved'].order).toBe(5);
            expect(TAB_CONFIG['images'].order).toBe(6);
            expect(TAB_CONFIG['export'].order).toBe(7);
            expect(TAB_CONFIG['published'].order).toBe(8);
            expect(TAB_CONFIG['failed'].order).toBe(9);
        });

        it('should have required properties for each tab config', () => {
            const requiredProps = ['label', 'icon', 'description', 'color', 'bgColor', 'isStatusTab', 'order'] as const;
            
            (Object.keys(TAB_CONFIG) as PipelineTab[]).forEach(tab => {
                requiredProps.forEach(prop => {
                    expect(TAB_CONFIG[tab][prop]).toBeDefined();
                });
            });
        });

        it('should identify status tabs correctly', () => {
            const statusTabs: PipelineTab[] = ['staging', 'scraped', 'consolidated', 'approved', 'published', 'failed'];
            
            statusTabs.forEach(tab => {
                expect(TAB_CONFIG[tab].isStatusTab).toBe(true);
            });

            const nonStatusTabs: PipelineTab[] = ['active-runs', 'active-consolidations', 'images', 'export'];
            nonStatusTabs.forEach(tab => {
                expect(TAB_CONFIG[tab].isStatusTab).toBe(false);
            });
        });
    });

    describe('getTabOrder', () => {
        it('should return correct order for each tab', () => {
            expect(getTabOrder('staging')).toBe(0);
            expect(getTabOrder('active-runs')).toBe(1);
            expect(getTabOrder('scraped')).toBe(2);
            expect(getTabOrder('active-consolidations')).toBe(3);
            expect(getTabOrder('consolidated')).toBe(4);
            expect(getTabOrder('approved')).toBe(5);
            expect(getTabOrder('images')).toBe(6);
            expect(getTabOrder('export')).toBe(7);
            expect(getTabOrder('published')).toBe(8);
            expect(getTabOrder('failed')).toBe(9);
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

        it('should return false for monitoring/action tabs', () => {
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
            expect(isMonitoringTab('published')).toBe(false);
            expect(isMonitoringTab('failed')).toBe(false);
            expect(isMonitoringTab('images')).toBe(false);
            expect(isMonitoringTab('export')).toBe(false);
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
