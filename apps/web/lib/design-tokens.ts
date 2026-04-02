import type { PersistedPipelineStatus } from './pipeline/types';

export const BRAND_COLORS = {
    FOREST_GREEN: '#008850',
    BURGUNDY: '#66161D',
    GOLD: '#FCD048',
} as const;

export const STATUS_COLORS = {
    SUCCESS: '#10B981',
    RUNNING: '#3B82F6',
    QUEUED: '#6B7280',
    FAILED: '#EF4444',
    WARNING: '#F59E0B',
} as const;

export type StatusColor = (typeof STATUS_COLORS)[keyof typeof STATUS_COLORS];

export const PIPELINE_STATUS_COLORS: Record<PersistedPipelineStatus, StatusColor> = {
    imported: STATUS_COLORS.QUEUED,
    scraped: STATUS_COLORS.RUNNING,
    finalized: STATUS_COLORS.SUCCESS,
    failed: STATUS_COLORS.FAILED,
} as const;

export const PIPELINE_STATUS_LABELS: Record<PersistedPipelineStatus, string> = {
    imported: 'Imported',
    scraped: 'Scraped',
    finalized: 'Finalized',
    failed: 'Failed',
} as const;

export const CSS_CUSTOM_PROPERTIES = {
    BRAND: {
        FOREST_GREEN: '--color-brand-forest-green',
        BURGUNDY: '--color-brand-burgundy',
        GOLD: '--color-brand-gold',
    } as const,
    STATUS: {
        SUCCESS: '--color-status-success',
        RUNNING: '--color-status-running',
        QUEUED: '--color-status-queued',
        FAILED: '--color-status-failed',
        WARNING: '--color-status-warning',
    } as const,
} as const;

export function getStatusColor(status: PersistedPipelineStatus): StatusColor {
    return PIPELINE_STATUS_COLORS[status];
}

export function getStatusCssVar(status: PersistedPipelineStatus): string {
    const statusToCssVar: Record<PersistedPipelineStatus, string> = {
        imported: CSS_CUSTOM_PROPERTIES.STATUS.QUEUED,
        scraped: CSS_CUSTOM_PROPERTIES.STATUS.RUNNING,
        finalized: CSS_CUSTOM_PROPERTIES.STATUS.SUCCESS,
        failed: CSS_CUSTOM_PROPERTIES.STATUS.FAILED,
    };
    return statusToCssVar[status];
}
