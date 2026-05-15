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
    MERGING: '#8B5CF6',
    URL_REVIEW: '#A855F7',
    EXTRACTING: '#2563EB',
    PUBLISHED: BRAND_COLORS.FOREST_GREEN,
} as const;

type StatusColor = (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS];

export const PIPELINE_STATUS_COLORS: Record<PersistedPipelineStatus, StatusColor> = {
    awaiting_brand: STATUS_COLORS.QUEUED,
    imported: STATUS_COLORS.QUEUED,
    extracting: STATUS_COLORS.EXTRACTING,
    processed: STATUS_COLORS.RUNNING,
    merging: STATUS_COLORS.MERGING,
    reviewing: STATUS_COLORS.WARNING,
    publishing: STATUS_COLORS.PUBLISHED,
    failed: STATUS_COLORS.FAILED,
} as const;

export const PIPELINE_STATUS_LABELS: Record<PersistedPipelineStatus, string> = {
    awaiting_brand: 'Awaiting Brand',
    imported: 'Imported',
    extracting: 'Extracting',
    processed: 'Processed',
    merging: 'Merging',
    reviewing: 'Reviewing',
    publishing: 'Publishing',
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
        MERGING: '--color-status-merging',
        URL_REVIEW: '--color-status-url-review',
        EXTRACTING: '--color-status-extracting',
    } as const,
} as const;

export function getStatusColor(status: PersistedPipelineStatus): StatusColor {
    return PIPELINE_STATUS_COLORS[status];
}

export function getStatusCssVar(status: PersistedPipelineStatus): string {
    const statusToCssVar: Record<PersistedPipelineStatus, string> = {
        awaiting_brand: CSS_CUSTOM_PROPERTIES.STATUS.QUEUED,
        imported: CSS_CUSTOM_PROPERTIES.STATUS.QUEUED,
        extracting: CSS_CUSTOM_PROPERTIES.STATUS.EXTRACTING,
        processed: CSS_CUSTOM_PROPERTIES.STATUS.RUNNING,
        merging: CSS_CUSTOM_PROPERTIES.STATUS.MERGING,
        reviewing: CSS_CUSTOM_PROPERTIES.STATUS.WARNING,
        publishing: CSS_CUSTOM_PROPERTIES.BRAND.FOREST_GREEN,
        failed: CSS_CUSTOM_PROPERTIES.STATUS.FAILED,
    };
    return statusToCssVar[status];
}
