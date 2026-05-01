import type { PersistedPipelineStatus } from './pipeline/types';

export const BRAND_COLORS = {
    FOREST_GREEN: '#1a4d3c', // Approximate hex for oklch(35% 0.08 160)
    WARM_GRAY: '#3e3c3a',    // Approximate hex for oklch(25% 0.02 90)
    CREAM: '#fcfaf8',        // Approximate hex for oklch(98% 0.01 90)
} as const;

export const STATUS_COLORS = {
    SUCCESS: '#10B981',
    RUNNING: '#3B82F6',
    QUEUED: '#6B7280',
    FAILED: '#EF4444',
    WARNING: '#F59E0B',
    CONSOLIDATING: '#8B5CF6',
    PUBLISHED: BRAND_COLORS.FOREST_GREEN,
} as const;

type StatusColor = (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS];

export const PIPELINE_STATUS_COLORS: Record<PersistedPipelineStatus, StatusColor> = {
    imported: STATUS_COLORS.QUEUED,
    scraping: STATUS_COLORS.RUNNING,
    scraped: STATUS_COLORS.RUNNING,
    consolidating: STATUS_COLORS.CONSOLIDATING,
    finalizing: STATUS_COLORS.WARNING,
    exporting: STATUS_COLORS.PUBLISHED,
    failed: STATUS_COLORS.FAILED,
} as const;

export const PIPELINE_STATUS_LABELS: Record<PersistedPipelineStatus, string> = {
    imported: 'Imported',
    scraping: 'Scraping',
    scraped: 'Scraped',
    consolidating: 'Consolidating',
    finalizing: 'Finalizing',
    exporting: 'Exporting',
    failed: 'Failed',
} as const;

export const CSS_CUSTOM_PROPERTIES = {
    BRAND: {
        FOREST_GREEN: '--color-brand-forest-green',
        WARM_GRAY: '--color-brand-warm-gray',
        CREAM: '--color-brand-cream',
    } as const,
    STATUS: {
        SUCCESS: '--color-status-success',
        RUNNING: '--color-status-running',
        QUEUED: '--color-status-queued',
        FAILED: '--color-status-failed',
        WARNING: '--color-status-warning',
        CONSOLIDATING: '--color-status-consolidating',
    } as const,
} as const;

export function getStatusColor(status: PersistedPipelineStatus): StatusColor {
    return PIPELINE_STATUS_COLORS[status];
}

export function getStatusCssVar(status: PersistedPipelineStatus): string {
    const statusToCssVar: Record<PersistedPipelineStatus, string> = {
        imported: CSS_CUSTOM_PROPERTIES.STATUS.QUEUED,
        scraping: CSS_CUSTOM_PROPERTIES.STATUS.RUNNING,
        scraped: CSS_CUSTOM_PROPERTIES.STATUS.RUNNING,
        consolidating: CSS_CUSTOM_PROPERTIES.STATUS.CONSOLIDATING,
        finalizing: CSS_CUSTOM_PROPERTIES.STATUS.WARNING,
        exporting: CSS_CUSTOM_PROPERTIES.BRAND.FOREST_GREEN,
        failed: CSS_CUSTOM_PROPERTIES.STATUS.FAILED,
    };
    return statusToCssVar[status];
}
