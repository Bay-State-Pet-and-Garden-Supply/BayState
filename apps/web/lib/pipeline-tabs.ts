/**
 * Pipeline tabs type definitions and configuration.
 *
 * Defines the pipeline tabs with display configuration and helper functions.
 * Note: Icon references are stored as strings, not imported components.
 */

import {
    DERIVED_PIPELINE_TABS,
    PERSISTED_PIPELINE_STATUSES,
    isDerivedTab,
    isPersistedStatus,
    type PersistedPipelineStatus,
    type PipelineTab as DerivedPipelineTab,
} from './pipeline/types';


/**
 * All tabs in the pipeline system.
 */
/**
 * @deprecated Use PersistedPipelineStatus or PipelineTab from './pipeline/types'.
 */
export type PipelineTab = PersistedPipelineStatus | DerivedPipelineTab;
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
    imported: {
        label: 'Imported',
        icon: 'Inbox',
        description: 'Products imported into ingestion and waiting for scraping',
        color: '#6B7280',
        bgColor: '#F3F4F6',
        isStatusTab: true,
        order: 1,
    },
    monitoring: {
        label: 'Monitoring',
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
        description: 'Products with completed scrape results ready for consolidation',
        color: '#8B5CF6',
        bgColor: '#EDE9FE',
        isStatusTab: true,
        order: 3,
    },
    consolidating: {
        label: 'Consolidating',
        icon: 'Brain',
        description: 'AI consolidation in progress',
        color: '#EC4899',
        bgColor: '#FCE7F3',
        isStatusTab: false,
        order: 4,
    },
    finalized: {
        label: 'Finalized',
        icon: 'Store',
        description: 'Products approved and ready for downstream publishing workflows',
        color: '#008850',
        bgColor: '#D1FAE5',
        isStatusTab: true,
        order: 5,
    },
    published: {
        label: 'Published',
        icon: 'PackageCheck',
        description: 'Derived view of products already published to the storefront',
        color: '#16A34A',
        bgColor: '#DCFCE7',
        isStatusTab: false,
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
    failed: {
        label: 'Failed',
        icon: 'AlertCircle',
        description: 'Products that failed processing',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        isStatusTab: true,
        order: 9,
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

export function isMonitoringTab(tab: PipelineTab): boolean {
    return isDerivedTab(tab) && (tab === 'monitoring' || tab === 'consolidating');
}

/**
 * Checks if a tab is an action tab.
 * Action tabs require user interaction (images, export).
 */
export function isActionTab(tab: PipelineTab): boolean {
    return tab === 'images' || tab === 'export';
}
