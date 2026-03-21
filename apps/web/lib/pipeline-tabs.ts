/**
 * Pipeline tabs type definitions and configuration.
 *
 * Defines the pipeline tabs with display configuration and helper functions.
 * Note: Icon references are stored as strings, not imported components.
 */

/**
 * All tabs in the pipeline system.
 */
export type PipelineTab =
    | 'registered'
    | 'active-runs'
    | 'enriched'
    | 'active-consolidations'
    | 'images'
    | 'export'
    | 'finalized'
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
    registered: {
        label: 'Registered',
        icon: 'Inbox',
        description: 'Imported products waiting to be enriched',
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
    enriched: {
        label: 'Enriched',
        icon: 'Download',
        description: 'Products with enriched data',
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
    images: {
        label: 'Images',
        icon: 'Image',
        description: 'Manage product images',
        color: '#06B6D4',
        bgColor: '#CFFAFE',
        isStatusTab: false,
        order: 5,
    },
    export: {
        label: 'Export',
        icon: 'Upload',
        description: 'Export products to store',
        color: '#6366F1',
        bgColor: '#E0E7FF',
        isStatusTab: false,
        order: 6,
    },
    finalized: {
        label: 'Finalizing',
        icon: 'Store',
        description: 'Review and finalize product data',
        color: '#008850',
        bgColor: '#D1FAE5',
        isStatusTab: true,
        order: 7,
    },
    failed: {
        label: 'Failed',
        icon: 'AlertCircle',
        description: 'Products that failed processing',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        isStatusTab: true,
        order: 8,
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
