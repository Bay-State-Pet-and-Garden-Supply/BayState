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
            expect(BRAND_COLORS.FOREST_GREEN).toBe('#1a4d3c');
        });

        it('should have correct Warm Gray value', () => {
            expect(BRAND_COLORS.WARM_GRAY).toBe('#3e3c3a');
        });

        it('should have correct Cream value', () => {
            expect(BRAND_COLORS.CREAM).toBe('#fcfaf8');
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
            expect(STATUS_COLORS.PUBLISHED).toBe('#1a4d3c');
        });
    });

    describe('PIPELINE_STATUS_COLORS', () => {
        it('should map imported to queued gray', () => {
            expect(PIPELINE_STATUS_COLORS.imported).toBe('#6B7280');
        });

        it('should map processed to running blue', () => {
            expect(PIPELINE_STATUS_COLORS.processed).toBe('#3B82F6');
        });

        it('should map reviewing to warning amber', () => {
            expect(PIPELINE_STATUS_COLORS.reviewing).toBe('#F59E0B');
        });

        it('should map publishing to forest green', () => {
            expect(PIPELINE_STATUS_COLORS.publishing).toBe('#1a4d3c');
        });

        it('should map failed to failed red', () => {
            expect(PIPELINE_STATUS_COLORS.failed).toBe('#EF4444');
        });
    });

    describe('PIPELINE_STATUS_LABELS', () => {
        it('should have correct labels for all statuses', () => {
            expect(PIPELINE_STATUS_LABELS.imported).toBe('Imported');
            expect(PIPELINE_STATUS_LABELS.url_review).toBe('URL Review');
            expect(PIPELINE_STATUS_LABELS.extracting).toBe('Extracting');
            expect(PIPELINE_STATUS_LABELS.processed).toBe('Processed');
            expect(PIPELINE_STATUS_LABELS.merging).toBe('Merging');
            expect(PIPELINE_STATUS_LABELS.reviewing).toBe('Reviewing');
            expect(PIPELINE_STATUS_LABELS.publishing).toBe('Publishing');
            expect(PIPELINE_STATUS_LABELS.failed).toBe('Failed');
        });
    });

    describe('CSS_CUSTOM_PROPERTIES', () => {
        it('should have brand color properties', () => {
            expect(CSS_CUSTOM_PROPERTIES.BRAND.FOREST_GREEN).toBe('--color-brand-forest-green');
            expect(CSS_CUSTOM_PROPERTIES.BRAND.WARM_GRAY).toBe('--color-brand-warm-gray');
            expect(CSS_CUSTOM_PROPERTIES.BRAND.CREAM).toBe('--color-brand-cream');
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

        it('should return correct color for processed status', () => {
            expect(getStatusColor('processed')).toBe('#3B82F6');
        });

        it('should return correct color for reviewing status', () => {
            expect(getStatusColor('reviewing')).toBe('#F59E0B');
        });

        it('should return correct color for publishing status', () => {
            expect(getStatusColor('publishing')).toBe('#1a4d3c');
        });

        it('should return correct color for failed status', () => {
            expect(getStatusColor('failed')).toBe('#EF4444');
        });
    });

    describe('getStatusCssVar', () => {
        it('should return correct CSS var for imported status', () => {
            expect(getStatusCssVar('imported')).toBe('--color-status-queued');
        });

        it('should return correct CSS var for processed status', () => {
            expect(getStatusCssVar('processed')).toBe('--color-status-running');
        });

        it('should return correct CSS var for reviewing status', () => {
            expect(getStatusCssVar('reviewing')).toBe('--color-status-warning');
        });

        it('should return correct CSS var for publishing status', () => {
            expect(getStatusCssVar('publishing')).toBe('--color-brand-forest-green');
        });

        it('should return correct CSS var for failed status', () => {
            expect(getStatusCssVar('failed')).toBe('--color-status-failed');
        });
    });
});
