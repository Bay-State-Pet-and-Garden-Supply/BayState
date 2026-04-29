import type { PersistedPipelineStatus } from './pipeline/types';

export const BRAND_COLORS = {
    FOREST_GREEN: '#008850',
    BURGUNDY: '#66161D',
    GOLD: '#FCD048',
} as const;

const SURFACE_COLORS = {
    ADMIN_BG: '#f4f6f8',
    ADMIN_CARD: '#ffffff',
    ADMIN_MUTED: '#eef2f6',
    ADMIN_BORDER: '#d7dde5',
    STOREFRONT_BG: '#f6f1e6',
    STOREFRONT_CARD: '#fffdf8',
    STOREFRONT_MUTED: '#f4ecdf',
    STOREFRONT_BORDER: '#d8cdbc',
} as const;

const SHADOWS = {
    ADMIN_XS: '0 1px 2px 0 rgb(15 23 42 / 0.06)',
    ADMIN_SM: '0 12px 24px -22px rgb(15 23 42 / 0.24)',
    ADMIN_MD: '0 22px 40px -28px rgb(15 23 42 / 0.28)',
    FLOAT: '0 28px 60px -30px rgb(15 23 42 / 0.34)',
    STOREFRONT_SM: '0 18px 34px -28px rgb(116 81 48 / 0.34)',
    STOREFRONT_MD: '0 28px 48px -30px rgb(116 81 48 / 0.42)',
} as const;

const RADII = {
    ADMIN: '4px',
    STORE_CARD: '16px',
    FLOATING: '18px',
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
        BURGUNDY: '--color-brand-burgundy',
        GOLD: '--color-brand-gold',
    } as const,
    STATUS: {
        SUCCESS: '--color-status-success',
        RUNNING: '--color-status-running',
        QUEUED: '--color-status-queued',
        FAILED: '--color-status-failed',
        WARNING: '--color-status-warning',
        CONSOLIDATING: '--color-status-consolidating',
    } as const,
    SURFACE: {
        ADMIN_BG: '--surface-admin-bg',
        ADMIN_CARD: '--surface-admin-card',
        ADMIN_BORDER: '--surface-admin-border',
        STOREFRONT_BG: '--bg-page',
        STOREFRONT_CARD: '--surface-storefront-card',
        STOREFRONT_BORDER: '--surface-storefront-border',
    } as const,
    SHADOW: {
        ADMIN_SM: '--shadow-sm',
        ADMIN_MD: '--shadow-md',
        FLOAT: '--shadow-float',
        STOREFRONT_SM: '--shadow-warm-sm',
        STOREFRONT_MD: '--shadow-warm-md',
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
