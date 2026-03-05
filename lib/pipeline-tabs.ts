import type { PipelineStatus } from './pipeline';

export type PipelineTab = 
    | PipelineStatus 
    | 'active-runs' 
    | 'active-consolidations' 
    | 'images' 
    | 'export';

export interface TabConfig {
    label: string;
    icon: string;
    description: string;
    color: string;
    bgColor: string;
    isStatusTab: boolean;
    order: number;
}

export const TAB_CONFIG: Record<PipelineTab, TabConfig> = {
    staging: {
        label: 'Imported',
        icon: 'Upload',
        description: 'New imports ready for enhancement',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        isStatusTab: true,
        order: 0,
    },
    'active-runs': {
        label: 'Active Runs',
        icon: 'Activity',
        description: 'Currently running scrape jobs',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        isStatusTab: false,
        order: 1,
    },
    scraped: {
        label: 'Enhanced',
        icon: 'Sparkles',
        description: 'Web scraped & AI enriched',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        isStatusTab: true,
        order: 2,
    },
    'active-consolidations': {
        label: 'Active Consolidations',
        icon: 'Brain',
        description: 'AI consolidation in progress',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        isStatusTab: false,
        order: 3,
    },
    consolidated: {
        label: 'Ready for Review',
        icon: 'FileCheck',
        description: 'AI consolidated, needs approval',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        isStatusTab: true,
        order: 4,
    },
    approved: {
        label: 'Verified',
        icon: 'CheckCircle2',
        description: 'Human verified, ready to publish',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        isStatusTab: true,
        order: 5,
    },
    images: {
        label: 'Images',
        icon: 'Image',
        description: 'Product image management',
        color: 'text-cyan-600',
        bgColor: 'bg-cyan-50',
        isStatusTab: false,
        order: 6,
    },
    export: {
        label: 'Export',
        icon: 'Download',
        description: 'Export products to store',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50',
        isStatusTab: false,
        order: 7,
    },
    published: {
        label: 'Live',
        icon: 'Globe',
        description: 'Published to store',
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        isStatusTab: true,
        order: 8,
    },
    failed: {
        label: 'Failed',
        icon: 'AlertCircle',
        description: 'Failed items requiring attention',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        isStatusTab: true,
        order: 9,
    },
};

export function getTabOrder(tab: PipelineTab): number {
    return TAB_CONFIG[tab].order;
}

export function isStatusTab(tab: PipelineTab): boolean {
    return TAB_CONFIG[tab].isStatusTab;
}

export function isMonitoringTab(tab: PipelineTab): boolean {
    return tab === 'active-runs' || tab === 'active-consolidations';
}

export function isActionTab(tab: PipelineTab): boolean {
    return tab === 'images' || tab === 'export';
}
