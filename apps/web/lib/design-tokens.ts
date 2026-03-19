import type { PipelineStatus } from './pipeline';

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

export const PIPELINE_STATUS_COLORS: Record<PipelineStatus, StatusColor> = {
    imported: STATUS_COLORS.QUEUED,
    monitoring: STATUS_COLORS.WARNING,
    scraped: STATUS_COLORS.RUNNING,
    consolidated: STATUS_COLORS.WARNING,
    finalized: STATUS_COLORS.SUCCESS,
    published: STATUS_COLORS.SUCCESS,
} as const;

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
    imported: 'Imported',
    monitoring: 'Monitoring',
    scraped: 'Scraped',
    consolidated: 'Consolidated',
    finalized: 'Finalized',
    published: 'Published',
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

export function getStatusColor(status: PipelineStatus): StatusColor {
    return PIPELINE_STATUS_COLORS[status];
}

export function getStatusCssVar(status: PipelineStatus): string {
    const statusToCssVar: Record<PipelineStatus, string> = {
        imported: CSS_CUSTOM_PROPERTIES.STATUS.QUEUED,
        monitoring: CSS_CUSTOM_PROPERTIES.STATUS.WARNING,
        scraped: CSS_CUSTOM_PROPERTIES.STATUS.RUNNING,
        consolidated: CSS_CUSTOM_PROPERTIES.STATUS.WARNING,
        finalized: CSS_CUSTOM_PROPERTIES.STATUS.SUCCESS,
        published: CSS_CUSTOM_PROPERTIES.STATUS.SUCCESS,
    };
    return statusToCssVar[status];
}
