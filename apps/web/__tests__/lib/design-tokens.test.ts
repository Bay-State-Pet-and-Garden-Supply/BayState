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
    });

    describe('PIPELINE_STATUS_COLORS', () => {
        it('should map imported to queued gray', () => {
            expect(PIPELINE_STATUS_COLORS.imported).toBe('#6B7280');
        });

        it('should map scraped to running blue', () => {
            expect(PIPELINE_STATUS_COLORS.scraped).toBe('#3B82F6');
        });

        it('should map consolidated to warning amber', () => {
            expect(PIPELINE_STATUS_COLORS.consolidated).toBe('#F59E0B');
        });

        it('should map finalized to success green', () => {
            expect(PIPELINE_STATUS_COLORS.finalized).toBe('#10B981');
        });

        it('should map published to success green', () => {
            expect(PIPELINE_STATUS_COLORS.published).toBe('#10B981');
        });
    });

    describe('PIPELINE_STATUS_LABELS', () => {
        it('should have correct labels for all statuses', () => {
            expect(PIPELINE_STATUS_LABELS.imported).toBe('Imported');
            expect(PIPELINE_STATUS_LABELS.scraped).toBe('Scraped');
            expect(PIPELINE_STATUS_LABELS.consolidated).toBe('Consolidated');
            expect(PIPELINE_STATUS_LABELS.finalized).toBe('Finalized');
            expect(PIPELINE_STATUS_LABELS.published).toBe('Published');
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

        it('should return correct color for consolidated status', () => {
            expect(getStatusColor('consolidated')).toBe('#F59E0B');
        });

        it('should return correct color for finalized status', () => {
            expect(getStatusColor('finalized')).toBe('#10B981');
        });

        it('should return correct color for published status', () => {
            expect(getStatusColor('published')).toBe('#10B981');
        });
    });

    describe('getStatusCssVar', () => {
        it('should return correct CSS var for imported status', () => {
            expect(getStatusCssVar('imported')).toBe('--color-status-queued');
        });

        it('should return correct CSS var for scraped status', () => {
            expect(getStatusCssVar('scraped')).toBe('--color-status-running');
        });

        it('should return correct CSS var for consolidated status', () => {
            expect(getStatusCssVar('consolidated')).toBe('--color-status-warning');
        });

        it('should return correct CSS var for finalized status', () => {
            expect(getStatusCssVar('finalized')).toBe('--color-status-success');
        });

        it('should return correct CSS var for published status', () => {
            expect(getStatusCssVar('published')).toBe('--color-status-success');
        });
    });
});
