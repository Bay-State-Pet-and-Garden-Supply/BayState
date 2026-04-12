import {
    BRAND_COLORS,
    STATUS_COLORS,
    PIPELINE_STATUS_COLORS,
    PIPELINE_STATUS_LABELS,
    CSS_CUSTOM_PROPERTIES,
    getStatusColor,
    getStatusCssVar,
} from '@/lib/design-tokens';

describe('design-tokens', () => {
    describe('BRAND_COLORS', () => {
        it('should have correct Forest Green value', () => {
            expect(BRAND_COLORS.FOREST_GREEN).toBe('#008850');
        });

        it('should have correct Burgundy value', () => {
            expect(BRAND_COLORS.BURGUNDY).toBe('#66161D');
        });

        it('should have correct Gold value', () => {
            expect(BRAND_COLORS.GOLD).toBe('#FCD048');
        });
    });

    describe('STATUS_COLORS', () => {
        it('should have correct Success value', () => {
            expect(STATUS_COLORS.SUCCESS).toBe('#10B981');
        });

        it('should have correct Running value', () => {
            expect(STATUS_COLORS.RUNNING).toBe('#3B82F6');
        });

        it('should have correct Queued value', () => {
            expect(STATUS_COLORS.QUEUED).toBe('#6B7280');
        });

        it('should have correct Failed value', () => {
            expect(STATUS_COLORS.FAILED).toBe('#EF4444');
        });

        it('should have correct Warning value', () => {
            expect(STATUS_COLORS.WARNING).toBe('#F59E0B');
        });

        it('should have correct Published value', () => {
            expect(STATUS_COLORS.PUBLISHED).toBe('#008850');
        });
    });

    describe('PIPELINE_STATUS_COLORS', () => {
        it('should map imported to queued gray', () => {
            expect(PIPELINE_STATUS_COLORS.imported).toBe('#6B7280');
        });

        it('should map scraped to running blue', () => {
            expect(PIPELINE_STATUS_COLORS.scraped).toBe('#3B82F6');
        });

        it('should map finalizing to warning amber', () => {
            expect(PIPELINE_STATUS_COLORS.finalizing).toBe('#F59E0B');
        });

        it('should map exporting to forest green', () => {
            expect(PIPELINE_STATUS_COLORS.exporting).toBe('#008850');
        });

        it('should map failed to failed red', () => {
            expect(PIPELINE_STATUS_COLORS.failed).toBe('#EF4444');
        });
    });

    describe('PIPELINE_STATUS_LABELS', () => {
        it('should have correct labels for all statuses', () => {
            expect(PIPELINE_STATUS_LABELS.imported).toBe('Imported');
            expect(PIPELINE_STATUS_LABELS.scraping).toBe('Scraping');
            expect(PIPELINE_STATUS_LABELS.scraped).toBe('Scraped');
            expect(PIPELINE_STATUS_LABELS.consolidating).toBe('Consolidating');
            expect(PIPELINE_STATUS_LABELS.finalizing).toBe('Finalizing');
            expect(PIPELINE_STATUS_LABELS.exporting).toBe('Exporting');
            expect(PIPELINE_STATUS_LABELS.failed).toBe('Failed');
        });
    });

    describe('CSS_CUSTOM_PROPERTIES', () => {
        it('should have brand color properties', () => {
            expect(CSS_CUSTOM_PROPERTIES.BRAND.FOREST_GREEN).toBe('--color-brand-forest-green');
            expect(CSS_CUSTOM_PROPERTIES.BRAND.BURGUNDY).toBe('--color-brand-burgundy');
            expect(CSS_CUSTOM_PROPERTIES.BRAND.GOLD).toBe('--color-brand-gold');
        });

        it('should have status color properties', () => {
            expect(CSS_CUSTOM_PROPERTIES.STATUS.SUCCESS).toBe('--color-status-success');
            expect(CSS_CUSTOM_PROPERTIES.STATUS.RUNNING).toBe('--color-status-running');
            expect(CSS_CUSTOM_PROPERTIES.STATUS.QUEUED).toBe('--color-status-queued');
            expect(CSS_CUSTOM_PROPERTIES.STATUS.FAILED).toBe('--color-status-failed');
            expect(CSS_CUSTOM_PROPERTIES.STATUS.WARNING).toBe('--color-status-warning');
        });
    });

    describe('getStatusColor', () => {
        it('should return correct color for imported status', () => {
            expect(getStatusColor('imported')).toBe('#6B7280');
        });

        it('should return correct color for scraped status', () => {
            expect(getStatusColor('scraped')).toBe('#3B82F6');
        });

        it('should return correct color for finalizing status', () => {
            expect(getStatusColor('finalizing')).toBe('#F59E0B');
        });

        it('should return correct color for exporting status', () => {
            expect(getStatusColor('exporting')).toBe('#008850');
        });

        it('should return correct color for failed status', () => {
            expect(getStatusColor('failed')).toBe('#EF4444');
        });
    });

    describe('getStatusCssVar', () => {
        it('should return correct CSS var for imported status', () => {
            expect(getStatusCssVar('imported')).toBe('--color-status-queued');
        });

        it('should return correct CSS var for scraped status', () => {
            expect(getStatusCssVar('scraped')).toBe('--color-status-running');
        });

        it('should return correct CSS var for finalizing status', () => {
            expect(getStatusCssVar('finalizing')).toBe('--color-status-warning');
        });

        it('should return correct CSS var for exporting status', () => {
            expect(getStatusCssVar('exporting')).toBe('--color-brand-forest-green');
        });

        it('should return correct CSS var for failed status', () => {
            expect(getStatusCssVar('failed')).toBe('--color-status-failed');
        });
    });
});
