/**
 * Pipeline tabs type definitions and configuration.
 *
 * Defines the 10-tab pipeline system with display configuration and helper functions.
 * Note: Icon references are stored as strings, not imported components.
 */

/**
 * All 10 tabs in the pipeline system.
 */
export type PipelineTab =
    | 'staging'
    | 'active-runs'
    | 'scraped'
    | 'active-consolidations'
    | 'consolidated'
    | 'approved'
    | 'images'
    | 'export'
    | 'published'
    | 'failed';

/**
 * Configuration for a single pipeline tab.
 */
export interface TabConfig {
    label: string;
    icon: string;
    description: string;
    color: string;
    bgColor: string;
    isStatusTab: boolean;
    order: number;
}

/**
 * TAB_CONFIG - Configuration for all pipeline tabs.
 * Icon values are component reference names (strings), NOT imports.
 */
export const TAB_CONFIG: Record<PipelineTab, TabConfig> = {
    staging: {
        label: 'Staging',
        icon: 'Inbox',
        description: 'Imported products waiting to be scraped',
        color: '#6B7280',
        bgColor: '#F3F4F6',
        isStatusTab: true,
        order: 1,
    },
    'active-runs': {
        label: 'Active Runs',
        icon: 'Play',
        description: 'Currently running scrape jobs',
        color: '#3B82F6',
        bgColor: '#DBEAFE',
        isStatusTab: false,
        order: 2,
    },
    scraped: {
        label: 'Scraped',
        icon: 'Download',
        description: 'Products with scraped data',
        color: '#8B5CF6',
        bgColor: '#EDE9FE',
        isStatusTab: true,
        order: 3,
    },
    'active-consolidations': {
        label: 'Active Consolidations',
        icon: 'Brain',
        description: 'AI consolidation in progress',
        color: '#EC4899',
        bgColor: '#FCE7F3',
        isStatusTab: false,
        order: 4,
    },
    consolidated: {
        label: 'Consolidated',
        icon: 'Merge',
        description: 'Products after AI enrichment',
        color: '#10B981',
        bgColor: '#D1FAE5',
        isStatusTab: true,
        order: 5,
    },
    approved: {
        label: 'Approved',
        icon: 'CheckCircle',
        description: 'Ready for publishing',
        color: '#F59E0B',
        bgColor: '#FEF3C7',
        isStatusTab: true,
        order: 6,
    },
    images: {
        label: 'Images',
        icon: 'Image',
        description: 'Manage product images',
        color: '#06B6D4',
        bgColor: '#CFFAFE',
        isStatusTab: false,
        order: 7,
    },
    export: {
        label: 'Export',
        icon: 'Upload',
        description: 'Export products to store',
        color: '#6366F1',
        bgColor: '#E0E7FF',
        isStatusTab: false,
        order: 8,
    },
    published: {
        label: 'Published',
        icon: 'Store',
        description: 'Live on storefront',
        color: '#008850',
        bgColor: '#D1FAE5',
        isStatusTab: true,
        order: 9,
    },
    failed: {
        label: 'Failed',
        icon: 'AlertCircle',
        description: 'Products that failed processing',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        isStatusTab: true,
        order: 10,
    },
};

/**
 * Returns all tabs in display order.
 */
export function getTabOrder(): PipelineTab[] {
    return (Object.keys(TAB_CONFIG) as PipelineTab[]).sort(
        (a, b) => TAB_CONFIG[a].order - TAB_CONFIG[b].order
    );
}

/**
 * Checks if a tab is a status tab.
 * Status tabs represent product states in the pipeline.
 */
export function isStatusTab(tab: PipelineTab): boolean {
    return TAB_CONFIG[tab].isStatusTab;
}

/**
 * Checks if a tab is a monitoring tab.
 * Monitoring tabs show active operations (active-runs, active-consolidations).
 */
export function isMonitoringTab(tab: PipelineTab): boolean {
    return tab === 'active-runs' || tab === 'active-consolidations';
}

/**
 * Checks if a tab is an action tab.
 * Action tabs require user interaction (images, export).
 */
export function isActionTab(tab: PipelineTab): boolean {
    return tab === 'images' || tab === 'export';
}
